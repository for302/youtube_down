"""
YouTube Downloader Engine using yt-dlp
Core downloader class with video/audio download capabilities
"""
import os
import sys
import re
import hashlib
import threading
from typing import Callable, Optional, Dict, Any

import yt_dlp

from config import config
from folder_manager import folder_manager
from services.metadata import MetadataService
from services.thumbnail import ThumbnailService
from services.library import LibraryService
from utils.file_utils import sanitize_filename


def get_ffmpeg_path() -> Optional[str]:
    """Get ffmpeg path - bundled or system

    Returns:
        Path to ffmpeg directory or None if using system ffmpeg
    """
    if getattr(sys, 'frozen', False):
        # Running as compiled exe
        base_path = sys._MEIPASS
        ffmpeg_path = os.path.join(base_path, 'ffmpeg', 'ffmpeg.exe')
        if os.path.exists(ffmpeg_path):
            return os.path.join(base_path, 'ffmpeg')
    else:
        # Running as script - check resources folder
        base_path = os.path.dirname(os.path.abspath(__file__))
        # Go up one level from services/ to project root
        project_root = os.path.dirname(base_path)
        ffmpeg_path = os.path.join(project_root, 'resources', 'ffmpeg', 'ffmpeg.exe')
        if os.path.exists(ffmpeg_path):
            return os.path.join(project_root, 'resources', 'ffmpeg')

    # Fall back to system ffmpeg
    return None


class DownloadProgress:
    """Track download progress with callback support"""

    def __init__(self, callback: Optional[Callable] = None):
        self.callback = callback
        self.progress = 0
        self.status = "Preparing..."
        self.filename = ""
        self.speed = ""
        self.eta = ""

    def hook(self, d: Dict[str, Any]):
        """yt-dlp progress hook"""
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            downloaded = d.get('downloaded_bytes', 0)

            if total > 0:
                self.progress = int((downloaded / total) * 100)

            self.speed = d.get('_speed_str', '')
            self.eta = d.get('_eta_str', '')
            self.filename = d.get('filename', '')
            self.status = f"Downloading... {self.progress}%"

            if self.callback:
                self.callback({
                    'status': 'downloading',
                    'progress': self.progress,
                    'speed': self.speed,
                    'eta': self.eta,
                    'filename': os.path.basename(self.filename)
                })

        elif d['status'] == 'finished':
            self.status = "Processing..."
            self.progress = 100
            if self.callback:
                self.callback({
                    'status': 'processing',
                    'progress': 100,
                    'message': 'Processing file...'
                })

        elif d['status'] == 'error':
            self.status = "Error occurred"
            if self.callback:
                self.callback({
                    'status': 'error',
                    'message': str(d.get('error', 'Unknown error'))
                })


class YouTubeDownloader:
    """YouTube video/audio downloader using yt-dlp"""

    def __init__(self, download_path: str = None):
        """Initialize downloader

        Args:
            download_path: Default download directory
        """
        self.download_path = download_path or os.path.join(
            os.path.expanduser('~'), 'Downloads'
        )
        self.ffmpeg_path = get_ffmpeg_path()
        self.current_download = None
        self._cancel_flag = False
        self._last_video_info = None

        # Initialize services
        self.metadata_service = MetadataService(self.download_path)
        self.thumbnail_service = ThumbnailService(self.download_path)
        self.library_service = LibraryService(self.download_path)

    def get_video_info(self, url: str) -> Dict[str, Any]:
        """Get video metadata without downloading

        Args:
            url: Video URL

        Returns:
            Dictionary with video information or error
        """
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }

        if self.ffmpeg_path:
            ydl_opts['ffmpeg_location'] = self.ffmpeg_path

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

                # Extract available formats
                formats = []
                seen_resolutions = set()

                for f in info.get('formats', []):
                    height = f.get('height')
                    if height and f.get('vcodec') != 'none':
                        resolution = f"{height}p"
                        if resolution not in seen_resolutions:
                            seen_resolutions.add(resolution)
                            formats.append({
                                'resolution': resolution,
                                'height': height,
                                'ext': f.get('ext', 'mp4'),
                                'filesize': f.get('filesize') or f.get('filesize_approx', 0)
                            })

                # Sort by resolution
                formats.sort(key=lambda x: x['height'], reverse=True)

                # Standard resolutions
                standard_resolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p']
                available_formats = []

                for res in standard_resolutions:
                    for fmt in formats:
                        if fmt['resolution'] == res:
                            available_formats.append(fmt)
                            break

                # Get tags - from YouTube or extract from description
                tags = info.get('tags', [])
                if not tags:
                    description = info.get('description', '')
                    tags = self._extract_hashtags(description)

                # Detect platform from extractor
                extractor = info.get('extractor', '').lower()
                platform = self._extractor_to_platform(extractor) or self.metadata_service._detect_platform(url)

                # Get unique video_id from yt-dlp or generate from URL
                video_id = info.get('id') or self._generate_id_from_url(url)

                # Store for later use when saving metadata
                self._last_video_info = {
                    'url': url,
                    'title': info.get('title', 'Unknown'),
                    'thumbnail': info.get('thumbnail', ''),
                    'duration': info.get('duration', 0),
                    'duration_str': self._format_duration(info.get('duration', 0)),
                    'channel': info.get('channel', info.get('uploader', 'Unknown')),
                    'channel_url': info.get('channel_url', info.get('uploader_url', '')),
                    'description': info.get('description', ''),
                    'view_count': info.get('view_count', 0),
                    'upload_date': info.get('upload_date', ''),
                    'video_id': video_id,
                    'tags': tags,
                    'platform': platform,
                }

                return {
                    'success': True,
                    'title': info.get('title', 'Unknown'),
                    'thumbnail': info.get('thumbnail', ''),
                    'duration': info.get('duration', 0),
                    'duration_str': self._format_duration(info.get('duration', 0)),
                    'channel': info.get('channel', info.get('uploader', 'Unknown')),
                    'channel_url': info.get('channel_url', info.get('uploader_url', '')),
                    'description': info.get('description', ''),
                    'view_count': info.get('view_count', 0),
                    'formats': available_formats,
                    'url': url,
                    'platform': platform,
                    'video_id': video_id
                }

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def download_video(
        self,
        url: str,
        resolution: str = '720p',
        progress_callback: Optional[Callable] = None,
        folder: str = '00_Inbox'
    ) -> Dict[str, Any]:
        """Download video as MP4 to the specified folder

        Args:
            url: Video URL
            resolution: Target resolution (e.g., '720p', '1080p')
            progress_callback: Callback function for progress updates
            folder: Target folder name

        Returns:
            Dictionary with success status and file info
        """
        self._cancel_flag = False
        progress = DownloadProgress(progress_callback)

        # Parse resolution to height
        height = int(resolution.replace('p', ''))

        # Determine download path
        if folder_manager.is_configured():
            download_dir = folder_manager.get_folder_path(folder)
            if not download_dir or not os.path.isdir(download_dir):
                download_dir = folder_manager.get_folder_path('00_Inbox')
        else:
            download_dir = self.download_path

        # Format selector with multiple fallbacks for different platforms
        # 1. Try requested height with separate streams (YouTube style)
        # 2. Fall back to best video+audio merge
        # 3. Fall back to best single stream (Instagram, TikTok style)
        format_selector = (
            f'bestvideo[height<={height}]+bestaudio/bestvideo+bestaudio/'
            f'best[height<={height}]/best'
        )

        ydl_opts = {
            'format': format_selector,
            'outtmpl': os.path.join(download_dir, '%(title)s.%(ext)s'),
            'merge_output_format': 'mp4',
            'progress_hooks': [progress.hook],
            'quiet': True,
            'no_warnings': True,
            'restrictfilenames': False,
            'windowsfilenames': True,  # Sanitize filenames for Windows compatibility
        }

        if self.ffmpeg_path:
            ydl_opts['ffmpeg_location'] = self.ffmpeg_path

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                self.current_download = ydl
                info = ydl.extract_info(url, download=True)

                if self._cancel_flag:
                    return {'success': False, 'error': 'Download cancelled.'}

                filename = ydl.prepare_filename(info)
                # Handle merged output
                if not filename.endswith('.mp4'):
                    filename = os.path.splitext(filename)[0] + '.mp4'

                # Get unique video_id
                video_id = info.get('id') or self._generate_id_from_url(url)
                base_filename = os.path.basename(filename)

                # Check if metadata already exists (e.g., from save_link_only)
                if self.metadata_service.metadata_exists(video_id):
                    # Just add the file info to existing metadata
                    self.metadata_service.add_file(video_id, 'video', base_filename, folder)
                else:
                    # Create new metadata with file info
                    self.metadata_service.save_metadata(
                        video_id, self._last_video_info, folder,
                        file_type='video', filename=base_filename
                    )
                    # Save thumbnail only if metadata is new
                    self.thumbnail_service.save_thumbnail(video_id, self._last_video_info)

                if progress_callback:
                    progress_callback({
                        'status': 'completed',
                        'progress': 100,
                        'filename': base_filename,
                        'filepath': filename
                    })

                return {
                    'success': True,
                    'filename': base_filename,
                    'filepath': filename,
                    'folder': folder,
                    'video_id': video_id
                }

        except Exception as e:
            if progress_callback:
                progress_callback({
                    'status': 'error',
                    'message': str(e)
                })
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            self.current_download = None

    def download_audio(
        self,
        url: str,
        bitrate: str = '192',
        progress_callback: Optional[Callable] = None,
        folder: str = '00_Inbox'
    ) -> Dict[str, Any]:
        """Download audio as MP3 to the specified folder

        Args:
            url: Video URL
            bitrate: Audio bitrate (e.g., '128', '192', '320')
            progress_callback: Callback function for progress updates
            folder: Target folder name

        Returns:
            Dictionary with success status and file info
        """
        self._cancel_flag = False
        progress = DownloadProgress(progress_callback)

        # Determine download path
        if folder_manager.is_configured():
            download_dir = folder_manager.get_folder_path(folder)
            if not download_dir or not os.path.isdir(download_dir):
                download_dir = folder_manager.get_folder_path('00_Inbox')
        else:
            download_dir = self.download_path

        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(download_dir, '%(title)s.%(ext)s'),
            'progress_hooks': [progress.hook],
            'quiet': True,
            'no_warnings': True,
            'windowsfilenames': True,  # Sanitize filenames for Windows compatibility
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': bitrate,
            }],
        }

        if self.ffmpeg_path:
            ydl_opts['ffmpeg_location'] = self.ffmpeg_path

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                self.current_download = ydl
                info = ydl.extract_info(url, download=True)

                if self._cancel_flag:
                    return {'success': False, 'error': 'Download cancelled.'}

                # Get the output filename (will be .mp3)
                filename = ydl.prepare_filename(info)
                filename = os.path.splitext(filename)[0] + '.mp3'

                # Get unique video_id
                video_id = info.get('id') or self._generate_id_from_url(url)
                base_filename = os.path.basename(filename)

                # Check if metadata already exists (e.g., from save_link_only or video download)
                if self.metadata_service.metadata_exists(video_id):
                    # Just add the file info to existing metadata
                    self.metadata_service.add_file(video_id, 'audio', base_filename, folder)
                else:
                    # Create new metadata with file info
                    self.metadata_service.save_metadata(
                        video_id, self._last_video_info, folder,
                        file_type='audio', filename=base_filename
                    )
                    # Save thumbnail only if metadata is new
                    self.thumbnail_service.save_thumbnail(video_id, self._last_video_info)

                if progress_callback:
                    progress_callback({
                        'status': 'completed',
                        'progress': 100,
                        'filename': base_filename,
                        'filepath': filename
                    })

                return {
                    'success': True,
                    'filename': base_filename,
                    'filepath': filename,
                    'folder': folder,
                    'video_id': video_id
                }

        except Exception as e:
            if progress_callback:
                progress_callback({
                    'status': 'error',
                    'message': str(e)
                })
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            self.current_download = None

    def cancel_download(self):
        """Cancel current download"""
        self._cancel_flag = True

    def set_download_path(self, path: str) -> bool:
        """Set download directory

        Args:
            path: New download directory path

        Returns:
            True if path is valid and set successfully
        """
        if os.path.isdir(path):
            self.download_path = path
            # Update services with new path
            self.metadata_service.fallback_path = path
            self.thumbnail_service.fallback_path = path
            self.library_service.download_path = path
            return True
        return False

    def save_link_only(self, url: str, folder: str = '00_Inbox') -> Dict[str, Any]:
        """Save video link without downloading - only metadata and thumbnail

        Args:
            url: Video URL
            folder: Target folder name

        Returns:
            Dictionary with success status
        """
        try:
            # Get video info
            result = self.get_video_info(url)
            if not result.get('success'):
                return result

            info = self._last_video_info
            if not info:
                return {'success': False, 'error': 'Could not get video information.'}

            # Get unique video_id (from yt-dlp or generate from URL)
            video_id = info.get('video_id') or self._generate_id_from_url(url)

            # Check if metadata already exists
            if self.metadata_service.metadata_exists(video_id):
                return {
                    'success': True,
                    'message': 'Link already saved.',
                    'video_id': video_id,
                    'already_exists': True
                }

            # Detect platform
            platform = self.metadata_service._detect_platform(url)
            info['platform'] = platform

            # Save metadata without file info (link only)
            self.metadata_service.save_metadata(video_id, info, folder)

            # Save thumbnail
            self.thumbnail_service.save_thumbnail(video_id, info)

            return {
                'success': True,
                'message': 'Link saved.',
                'video_id': video_id
            }

        except Exception as e:
            return {'success': False, 'error': str(e)}

    # Delegate methods to services for backward compatibility

    def get_url_from_metadata(self, video_id: str) -> Optional[str]:
        """Get original URL from metadata file"""
        return self.metadata_service.get_url_from_metadata(video_id)

    def mark_as_downloaded(self, video_id: str) -> bool:
        """Update metadata to mark video as downloaded"""
        return self.metadata_service.mark_as_downloaded(video_id)

    def update_metadata(self, video_id: str, updates: Dict[str, Any]) -> bool:
        """Update metadata fields"""
        return self.metadata_service.update_metadata(video_id, updates)

    def update_tags(self, video_id: str, tags: list) -> bool:
        """Update tags in metadata"""
        return self.metadata_service.update_tags(video_id, tags)

    def get_video_library(self, folder: str = None):
        """Get list of downloaded videos"""
        return self.library_service.get_video_library(folder)

    def get_all_tags(self) -> list:
        """Get all unique tags"""
        return self.library_service.get_all_tags()

    @staticmethod
    def _generate_id_from_url(url: str) -> str:
        """Generate unique ID from URL (fallback when yt-dlp doesn't provide ID)

        Args:
            url: Video URL

        Returns:
            12-character hash ID
        """
        return hashlib.md5(url.encode()).hexdigest()[:12]

    @staticmethod
    def _extract_hashtags(text: str) -> list:
        """Extract hashtags from text (description)"""
        if not text:
            return []

        # Find all hashtags (Korean and English supported)
        hashtags = re.findall(r'#([\w\uac00-\ud7a3]+)', text)

        # Remove duplicates while preserving order
        seen = set()
        unique_tags = []
        for tag in hashtags:
            if tag.lower() not in seen:
                seen.add(tag.lower())
                unique_tags.append(tag)

        return unique_tags

    def _extractor_to_platform(self, extractor: str) -> str:
        """Convert yt-dlp extractor name to platform name"""
        if not extractor:
            return None

        extractor = extractor.lower()

        # Map yt-dlp extractor names to our platform names
        extractor_map = {
            'youtube': 'youtube',
            'instagram': 'instagram',
            'tiktok': 'tiktok',
            'facebook': 'facebook',
            'twitter': 'twitter',
            'vimeo': 'vimeo',
            'dailymotion': 'dailymotion',
            'naver': 'naver',
            'navertv': 'naver',
            'navercafe': 'naver',
            'pinterest': 'pinterest',
            'reddit': 'reddit',
            'soundcloud': 'soundcloud',
        }

        # Check exact match first
        if extractor in extractor_map:
            return extractor_map[extractor]

        # Check partial match (e.g., 'instagram:story' -> 'instagram')
        for key, platform in extractor_map.items():
            if key in extractor:
                return platform

        return None

    @staticmethod
    def _format_duration(seconds) -> str:
        """Format duration in seconds to HH:MM:SS or MM:SS"""
        if not seconds:
            return "0:00"

        # Convert to int to handle float durations from some platforms
        seconds = int(seconds)
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60

        if hours > 0:
            return f"{hours}:{minutes:02d}:{secs:02d}"
        return f"{minutes}:{secs:02d}"


def download_async(
    downloader: YouTubeDownloader,
    url: str,
    download_type: str,
    options: Dict[str, Any],
    progress_callback: Optional[Callable] = None,
    complete_callback: Optional[Callable] = None
):
    """Run download in background thread

    Args:
        downloader: YouTubeDownloader instance
        url: Video URL
        download_type: 'video' or 'audio'
        options: Download options (resolution, bitrate, folder)
        progress_callback: Callback for progress updates
        complete_callback: Callback when download completes

    Returns:
        Thread object
    """
    def run():
        folder = options.get('folder', '00_Inbox')

        if download_type == 'video':
            result = downloader.download_video(
                url,
                resolution=options.get('resolution', '720p'),
                progress_callback=progress_callback,
                folder=folder
            )
        else:
            result = downloader.download_audio(
                url,
                bitrate=options.get('bitrate', '192'),
                progress_callback=progress_callback,
                folder=folder
            )

        if complete_callback:
            complete_callback(result)

    thread = threading.Thread(target=run)
    thread.daemon = True
    thread.start()
    return thread
