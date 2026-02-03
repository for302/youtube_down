"""
YouTube Downloader Engine using yt-dlp
"""
import os
import sys
import re
import threading
import urllib.request
from datetime import datetime
from typing import Callable, Optional, Dict, Any, List
import yt_dlp

from config import config
from folder_manager import folder_manager


def get_ffmpeg_path() -> str:
    """Get ffmpeg path - bundled or system"""
    if getattr(sys, 'frozen', False):
        # Running as compiled exe
        base_path = sys._MEIPASS
        ffmpeg_path = os.path.join(base_path, 'ffmpeg', 'ffmpeg.exe')
        if os.path.exists(ffmpeg_path):
            return os.path.join(base_path, 'ffmpeg')
    else:
        # Running as script - check resources folder
        base_path = os.path.dirname(os.path.abspath(__file__))
        ffmpeg_path = os.path.join(base_path, 'resources', 'ffmpeg', 'ffmpeg.exe')
        if os.path.exists(ffmpeg_path):
            return os.path.join(base_path, 'resources', 'ffmpeg')

    # Fall back to system ffmpeg
    return None


def sanitize_filename(filename: str) -> str:
    """Remove invalid characters from filename"""
    # Remove invalid characters for Windows filenames
    invalid_chars = r'[<>:"/\\|?*]'
    sanitized = re.sub(invalid_chars, '', filename)
    # Also remove control characters
    sanitized = re.sub(r'[\x00-\x1f\x7f]', '', sanitized)
    # Trim whitespace and dots from ends
    sanitized = sanitized.strip('. ')
    # Limit length
    if len(sanitized) > 200:
        sanitized = sanitized[:200]
    return sanitized or 'untitled'


class DownloadProgress:
    """Track download progress"""
    def __init__(self, callback: Optional[Callable] = None):
        self.callback = callback
        self.progress = 0
        self.status = "준비 중..."
        self.filename = ""
        self.speed = ""
        self.eta = ""

    def hook(self, d: Dict[str, Any]):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            downloaded = d.get('downloaded_bytes', 0)

            if total > 0:
                self.progress = int((downloaded / total) * 100)

            self.speed = d.get('_speed_str', '')
            self.eta = d.get('_eta_str', '')
            self.filename = d.get('filename', '')
            self.status = f"다운로드 중... {self.progress}%"

            if self.callback:
                self.callback({
                    'status': 'downloading',
                    'progress': self.progress,
                    'speed': self.speed,
                    'eta': self.eta,
                    'filename': os.path.basename(self.filename)
                })

        elif d['status'] == 'finished':
            self.status = "처리 중..."
            self.progress = 100
            if self.callback:
                self.callback({
                    'status': 'processing',
                    'progress': 100,
                    'message': '파일 처리 중...'
                })

        elif d['status'] == 'error':
            self.status = "오류 발생"
            if self.callback:
                self.callback({
                    'status': 'error',
                    'message': str(d.get('error', '알 수 없는 오류'))
                })


class YouTubeDownloader:
    """YouTube video/audio downloader"""

    def __init__(self, download_path: str = None):
        self.download_path = download_path or os.path.join(
            os.path.expanduser('~'), 'Downloads'
        )
        self.ffmpeg_path = get_ffmpeg_path()
        self.current_download = None
        self._cancel_flag = False
        self._last_video_info = None

    def get_video_info(self, url: str) -> Dict[str, Any]:
        """Get video metadata without downloading"""
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
                    # Extract hashtags from description
                    description = info.get('description', '')
                    tags = self._extract_hashtags(description)

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
                    'video_id': info.get('id', ''),
                    'tags': tags,
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
                    'url': url
                }

        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def _save_thumbnail(self, video_filepath: str, info: Dict[str, Any] = None):
        """Download and save thumbnail image"""
        if info is None:
            info = self._last_video_info

        if not info or not info.get('thumbnail'):
            return None

        thumbnail_url = info.get('thumbnail', '')
        if not thumbnail_url:
            return None

        # Get thumbnail filename based on video filename
        video_filename = os.path.basename(video_filepath)
        base_name = os.path.splitext(video_filename)[0]

        # Determine where to save thumbnail
        if folder_manager.is_configured():
            thumbnails_dir = folder_manager.thumbnails_path
            os.makedirs(thumbnails_dir, exist_ok=True)
            thumbnail_path = os.path.join(thumbnails_dir, base_name + '.jpg')
        else:
            # Fallback to same folder as video
            thumbnail_path = os.path.splitext(video_filepath)[0] + '_thumb.jpg'

        try:
            # Download thumbnail
            req = urllib.request.Request(
                thumbnail_url,
                headers={'User-Agent': 'Mozilla/5.0'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                with open(thumbnail_path, 'wb') as f:
                    f.write(response.read())
            return thumbnail_path
        except Exception as e:
            print(f"Error saving thumbnail: {e}")
            return None

    def _save_metadata(self, video_filepath: str, info: Dict[str, Any] = None, folder: str = None, link_only: bool = False):
        """Save video metadata as .md file in the metadata folder"""
        if info is None:
            info = self._last_video_info

        if not info:
            return

        # Get metadata folder path
        video_filename = os.path.basename(video_filepath)
        base_name = os.path.splitext(video_filename)[0]

        # Determine where to save metadata
        if folder_manager.is_configured():
            md_filepath = os.path.join(folder_manager.metadata_path, base_name + '.md')
        else:
            # Fallback to same folder as video
            md_filepath = os.path.splitext(video_filepath)[0] + '.md'

        # Add folder info to metadata
        if folder:
            info['folder'] = folder

        # Detect platform if not set
        if 'platform' not in info:
            info['platform'] = self._detect_platform(info.get('url', ''))

        # Format upload date
        upload_date = info.get('upload_date', '')
        if upload_date and len(upload_date) == 8:
            upload_date = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"

        # Format tags
        tags = info.get('tags', [])
        tags_str = ', '.join(tags) if tags else ''

        # Link only marker
        link_only_marker = '\n*링크만 저장됨*\n' if link_only else ''

        # Create markdown content
        md_content = f"""# {info.get('title', 'Unknown')}

## 기본 정보

| 항목 | 내용 |
|------|------|
| **채널** | [{info.get('channel', 'Unknown')}]({info.get('channel_url', '#')}) |
| **플랫폼** | {info.get('platform', 'other')} |
| **재생시간** | {info.get('duration_str', '')} |
| **업로드일** | {upload_date} |
| **조회수** | {info.get('view_count', 0):,} |

## 태그

{tags_str}

## 링크

- **원본 URL**: {info.get('url', '')}
- **채널 URL**: {info.get('channel_url', '')}
- **썸네일**: {info.get('thumbnail', '')}

## 상세 정보

{info.get('description', '설명 없음')}

---
*다운로드 일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*{link_only_marker}
"""

        try:
            with open(md_filepath, 'w', encoding='utf-8') as f:
                f.write(md_content)
        except Exception as e:
            print(f"Error saving metadata: {e}")

    def download_video(self, url: str, resolution: str = '720p',
                       progress_callback: Optional[Callable] = None,
                       folder: str = '00_Inbox') -> Dict[str, Any]:
        """Download video as MP4 to the specified folder"""
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

        ydl_opts = {
            'format': f'bestvideo[height<={height}]+bestaudio/best[height<={height}]',
            'outtmpl': os.path.join(download_dir, '%(title)s.%(ext)s'),
            'merge_output_format': 'mp4',
            'progress_hooks': [progress.hook],
            'quiet': True,
            'no_warnings': True,
            'restrictfilenames': False,
        }

        if self.ffmpeg_path:
            ydl_opts['ffmpeg_location'] = self.ffmpeg_path

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                self.current_download = ydl
                info = ydl.extract_info(url, download=True)

                if self._cancel_flag:
                    return {'success': False, 'error': '다운로드가 취소되었습니다.'}

                filename = ydl.prepare_filename(info)
                # Handle merged output
                if not filename.endswith('.mp4'):
                    filename = os.path.splitext(filename)[0] + '.mp4'

                # Save metadata and thumbnail
                self._save_metadata(filename, folder=folder)
                self._save_thumbnail(filename)

                if progress_callback:
                    progress_callback({
                        'status': 'completed',
                        'progress': 100,
                        'filename': os.path.basename(filename),
                        'filepath': filename
                    })

                return {
                    'success': True,
                    'filename': os.path.basename(filename),
                    'filepath': filename,
                    'folder': folder
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

    def download_audio(self, url: str, bitrate: str = '192',
                       progress_callback: Optional[Callable] = None,
                       folder: str = '00_Inbox') -> Dict[str, Any]:
        """Download audio as MP3 to the specified folder"""
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
                    return {'success': False, 'error': '다운로드가 취소되었습니다.'}

                # Get the output filename (will be .mp3)
                filename = ydl.prepare_filename(info)
                filename = os.path.splitext(filename)[0] + '.mp3'

                # Save metadata and thumbnail for audio too
                self._save_metadata(filename, folder=folder)
                self._save_thumbnail(filename)

                if progress_callback:
                    progress_callback({
                        'status': 'completed',
                        'progress': 100,
                        'filename': os.path.basename(filename),
                        'filepath': filename
                    })

                return {
                    'success': True,
                    'filename': os.path.basename(filename),
                    'filepath': filename,
                    'folder': folder
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

    def save_link_only(self, url: str, folder: str = '00_Inbox') -> Dict[str, Any]:
        """Save video link without downloading - only metadata and thumbnail"""
        try:
            # Get video info
            result = self.get_video_info(url)
            if not result.get('success'):
                return result

            info = self._last_video_info
            if not info:
                return {'success': False, 'error': '동영상 정보를 가져올 수 없습니다.'}

            # Detect platform
            platform = self._detect_platform(url)
            info['platform'] = platform
            info['link_only'] = True

            # Generate filename from title
            sanitized_title = sanitize_filename(info.get('title', 'untitled'))
            fake_filepath = os.path.join(
                folder_manager.get_folder_path(folder) or self.download_path,
                sanitized_title + '.mp4'
            )

            # Save metadata with link_only flag
            self._save_metadata(fake_filepath, info, folder, link_only=True)

            # Save thumbnail
            self._save_thumbnail(fake_filepath, info)

            return {
                'success': True,
                'message': '링크가 저장되었습니다.',
                'video_id': sanitized_title
            }

        except Exception as e:
            return {'success': False, 'error': str(e)}

    def get_url_from_metadata(self, video_id: str) -> Optional[str]:
        """Get original URL from metadata file"""
        md_path = os.path.join(folder_manager.metadata_path, video_id + '.md')
        if not os.path.exists(md_path):
            # Try with download_path
            md_path = os.path.join(self.download_path, video_id + '.md')

        if not os.path.exists(md_path):
            return None

        info = self._parse_metadata(md_path)
        return info.get('url')

    def mark_as_downloaded(self, video_id: str) -> bool:
        """Update metadata to mark video as downloaded (remove link_only flag)"""
        md_path = os.path.join(folder_manager.metadata_path, video_id + '.md')
        if not os.path.exists(md_path):
            return False

        try:
            with open(md_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Remove link_only marker
            content = content.replace('\n*링크만 저장됨*\n', '\n')

            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(content)

            return True
        except Exception:
            return False

    def update_metadata(self, video_id: str, updates: Dict[str, Any]) -> bool:
        """Update metadata fields (title, description)"""
        md_path = os.path.join(folder_manager.metadata_path, video_id + '.md')
        if not os.path.exists(md_path):
            md_path = os.path.join(self.download_path, video_id + '.md')

        if not os.path.exists(md_path):
            return False

        try:
            with open(md_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Update title
            if 'title' in updates:
                new_title = updates['title']
                content = re.sub(r'^# .+$', f'# {new_title}', content, count=1, flags=re.MULTILINE)

            # Update description
            if 'description' in updates:
                new_desc = updates['description']
                content = re.sub(
                    r'(## 상세 정보\n\n)(.+?)(\n\n---)',
                    rf'\g<1>{new_desc}\g<3>',
                    content,
                    flags=re.DOTALL
                )

            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(content)

            return True
        except Exception as e:
            print(f"Error updating metadata: {e}")
            return False

    def _detect_platform(self, url: str) -> str:
        """Detect platform from URL"""
        if not url:
            return 'other'

        url_lower = url.lower()
        patterns = {
            'youtube': [r'youtube\.com', r'youtu\.be'],
            'tiktok': [r'tiktok\.com', r'vm\.tiktok\.com'],
            'instagram': [r'instagram\.com', r'instagr\.am'],
            'facebook': [r'facebook\.com', r'fb\.watch', r'fb\.com'],
            'twitter': [r'twitter\.com', r'x\.com'],
            'vimeo': [r'vimeo\.com'],
            'naver': [r'naver\.com', r'tv\.naver\.com', r'clip\.naver\.com'],
            'pinterest': [r'pinterest\.com'],
        }

        for platform, regexes in patterns.items():
            for pattern in regexes:
                if re.search(pattern, url_lower):
                    return platform

        return 'other'

    def set_download_path(self, path: str):
        """Set download directory"""
        if os.path.isdir(path):
            self.download_path = path
            return True
        return False

    def get_video_library(self, folder: str = None) -> List[Dict[str, Any]]:
        """Get list of downloaded videos with their metadata"""
        videos = []

        # Check if using new folder structure
        if folder_manager.is_configured():
            return self._get_library_from_folder_structure(folder)

        # Fallback to old single-folder structure
        if not os.path.isdir(self.download_path):
            return videos

        # Find all .md files (metadata files)
        for filename in os.listdir(self.download_path):
            if filename.endswith('.md'):
                md_path = os.path.join(self.download_path, filename)
                base_name = os.path.splitext(filename)[0]

                # Check if corresponding video exists
                video_path = None
                for ext in ['.mp4', '.webm', '.mkv', '.mp3']:
                    potential_path = os.path.join(self.download_path, base_name + ext)
                    if os.path.exists(potential_path):
                        video_path = potential_path
                        break

                if video_path:
                    # Parse metadata from .md file
                    video_info = self._parse_metadata(md_path)
                    video_info['id'] = base_name
                    video_info['filepath'] = video_path
                    video_info['filename'] = os.path.basename(video_path)
                    video_info['folder'] = ''
                    videos.append(video_info)

        # Sort by modification time (newest first)
        videos.sort(key=lambda x: os.path.getmtime(x['filepath']), reverse=True)

        return videos

    def _get_library_from_folder_structure(self, folder: str = None) -> List[Dict[str, Any]]:
        """Get videos from the new folder structure"""
        videos = []
        video_extensions = ('.mp4', '.webm', '.mkv', '.mp3')
        seen_ids = set()

        # Get list of folders to scan
        if folder:
            folders_to_scan = [folder]
        else:
            folders = folder_manager.get_folders()
            folders_to_scan = [f['name'] for f in folders]

        # First, scan video files
        for folder_name in folders_to_scan:
            folder_path = folder_manager.get_folder_path(folder_name)
            if not folder_path or not os.path.isdir(folder_path):
                continue

            for filename in os.listdir(folder_path):
                if filename.lower().endswith(video_extensions):
                    video_path = os.path.join(folder_path, filename)
                    base_name = os.path.splitext(filename)[0]
                    seen_ids.add(base_name)

                    # Look for metadata in metadata folder
                    md_path = os.path.join(folder_manager.metadata_path, base_name + '.md')
                    if os.path.exists(md_path):
                        video_info = self._parse_metadata(md_path)
                    else:
                        video_info = {
                            'title': base_name,
                            'channel': '',
                            'channel_url': '',
                            'duration_str': '',
                            'url': '',
                            'thumbnail': '',
                            'description': '',
                            'tags': [],
                            'platform': 'other',
                            'link_only': False,
                        }

                    video_info['id'] = base_name
                    video_info['filepath'] = video_path
                    video_info['filename'] = filename
                    video_info['folder'] = folder_name
                    video_info['link_only'] = False  # Has video file

                    # Check for local thumbnail
                    thumbnail_path = os.path.join(folder_manager.thumbnails_path, base_name + '.jpg')
                    video_info['local_thumbnail'] = os.path.exists(thumbnail_path)

                    # Detect platform if not in metadata
                    if not video_info.get('platform'):
                        video_info['platform'] = self._detect_platform(video_info.get('url', ''))

                    videos.append(video_info)

        # Then, scan metadata folder for link-only items
        if folder_manager.is_configured() and os.path.isdir(folder_manager.metadata_path):
            for md_filename in os.listdir(folder_manager.metadata_path):
                if md_filename.endswith('.md'):
                    base_name = os.path.splitext(md_filename)[0]

                    # Skip if already found as video file
                    if base_name in seen_ids:
                        continue

                    md_path = os.path.join(folder_manager.metadata_path, md_filename)
                    video_info = self._parse_metadata(md_path)

                    # Only include if it's a link-only item
                    if video_info.get('link_only'):
                        video_info['id'] = base_name
                        video_info['filepath'] = md_path
                        video_info['filename'] = base_name
                        video_info['folder'] = video_info.get('folder', config.default_folder)

                        # Check for local thumbnail
                        thumbnail_path = os.path.join(folder_manager.thumbnails_path, base_name + '.jpg')
                        video_info['local_thumbnail'] = os.path.exists(thumbnail_path)

                        # Detect platform if not in metadata
                        if not video_info.get('platform'):
                            video_info['platform'] = self._detect_platform(video_info.get('url', ''))

                        videos.append(video_info)

        # Sort by modification time (newest first)
        def get_mtime(v):
            try:
                return os.path.getmtime(v['filepath'])
            except:
                return 0

        videos.sort(key=get_mtime, reverse=True)

        return videos

    def _parse_metadata(self, md_path: str) -> Dict[str, Any]:
        """Parse metadata from .md file"""
        info = {
            'title': '',
            'channel': '',
            'channel_url': '',
            'duration_str': '',
            'url': '',
            'thumbnail': '',
            'description': '',
            'tags': [],
            'platform': 'other',
            'link_only': False,
        }

        try:
            with open(md_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Extract title (first # heading)
            title_match = re.search(r'^# (.+)$', content, re.MULTILINE)
            if title_match:
                info['title'] = title_match.group(1).strip()

            # Extract channel from table
            channel_match = re.search(r'\*\*채널\*\* \| \[(.+?)\]\((.+?)\)', content)
            if channel_match:
                info['channel'] = channel_match.group(1)
                info['channel_url'] = channel_match.group(2)

            # Extract platform
            platform_match = re.search(r'\*\*플랫폼\*\* \| (.+)', content)
            if platform_match:
                info['platform'] = platform_match.group(1).strip()

            # Extract duration
            duration_match = re.search(r'\*\*재생시간\*\* \| (.+)', content)
            if duration_match:
                info['duration_str'] = duration_match.group(1).strip()

            # Extract tags (between ## 태그 and ## 링크)
            tags_match = re.search(r'## 태그\n\n(.+?)\n\n## 링크', content, re.DOTALL)
            if tags_match:
                tags_str = tags_match.group(1).strip()
                if tags_str:
                    info['tags'] = [t.strip() for t in tags_str.split(',') if t.strip()]

            # Extract URL (원본 URL or YouTube URL for backwards compatibility)
            url_match = re.search(r'\*\*원본 URL\*\*: (.+)', content)
            if not url_match:
                url_match = re.search(r'\*\*YouTube URL\*\*: (.+)', content)
            if url_match:
                info['url'] = url_match.group(1).strip()

            # Extract thumbnail
            thumb_match = re.search(r'\*\*썸네일\*\*: (.+)', content)
            if thumb_match:
                info['thumbnail'] = thumb_match.group(1).strip()

            # Extract description (after ## 상세 정보)
            desc_match = re.search(r'## 상세 정보\n\n(.+?)\n\n---', content, re.DOTALL)
            if desc_match:
                info['description'] = desc_match.group(1).strip()

            # Check link_only flag
            if '*링크만 저장됨*' in content:
                info['link_only'] = True

        except Exception as e:
            print(f"Error parsing metadata: {e}")

        return info

    def update_tags(self, video_id: str, tags: list) -> bool:
        """Update tags in .md file"""
        md_path = os.path.join(self.download_path, video_id + '.md')

        if not os.path.exists(md_path):
            return False

        try:
            with open(md_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Replace tags section
            tags_str = ', '.join(tags) if tags else ''
            new_content = re.sub(
                r'(## 태그\n\n)(.+?)(\n\n## 링크)',
                rf'\g<1>{tags_str}\g<3>',
                content,
                flags=re.DOTALL
            )

            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(new_content)

            return True
        except Exception as e:
            print(f"Error updating tags: {e}")
            return False

    def get_all_tags(self) -> list:
        """Get all unique tags from all videos"""
        all_tags = set()

        if not os.path.isdir(self.download_path):
            return []

        for filename in os.listdir(self.download_path):
            if filename.endswith('.md'):
                md_path = os.path.join(self.download_path, filename)
                info = self._parse_metadata(md_path)
                all_tags.update(info.get('tags', []))

        return sorted(list(all_tags))

    @staticmethod
    def _extract_hashtags(text: str) -> list:
        """Extract hashtags from text (description)"""
        if not text:
            return []

        # Find all hashtags (Korean and English supported)
        hashtags = re.findall(r'#([\w가-힣]+)', text)

        # Remove duplicates while preserving order
        seen = set()
        unique_tags = []
        for tag in hashtags:
            if tag.lower() not in seen:
                seen.add(tag.lower())
                unique_tags.append(tag)

        return unique_tags

    @staticmethod
    def _format_duration(seconds: int) -> str:
        """Format duration in seconds to HH:MM:SS or MM:SS"""
        if not seconds:
            return "0:00"

        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60

        if hours > 0:
            return f"{hours}:{minutes:02d}:{secs:02d}"
        return f"{minutes}:{secs:02d}"


def download_async(downloader: YouTubeDownloader, url: str,
                   download_type: str, options: Dict[str, Any],
                   progress_callback: Optional[Callable] = None,
                   complete_callback: Optional[Callable] = None):
    """Run download in background thread"""
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
