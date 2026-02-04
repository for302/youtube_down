"""
Library service for managing downloaded video collections
"""
import os
from typing import Dict, Any, List, Optional, Set

from config import config
from folder_manager import folder_manager
from services.metadata import MetadataService


class LibraryService:
    """Service for managing and querying the video library"""

    def __init__(self, download_path: str = None):
        """Initialize library service

        Args:
            download_path: Default download path when folder_manager is not configured
        """
        self.download_path = download_path or os.path.join(
            os.path.expanduser('~'), 'Downloads'
        )
        self.metadata_service = MetadataService(self.download_path)

    def get_video_library(self, folder: str = None) -> List[Dict[str, Any]]:
        """Get list of downloaded videos with their metadata

        Args:
            folder: Optional folder name to filter by

        Returns:
            List of video information dictionaries
        """
        # Check if using new folder structure
        if folder_manager.is_configured():
            return self._get_library_from_folder_structure(folder)

        # Fallback to old single-folder structure
        return self._get_library_from_single_folder()

    def _get_library_from_single_folder(self) -> List[Dict[str, Any]]:
        """Get videos from single download folder (legacy mode)

        Returns:
            List of video information dictionaries
        """
        videos = []

        if not os.path.isdir(self.download_path):
            return videos

        # Find all .md files (metadata files)
        for filename in os.listdir(self.download_path):
            if filename.endswith('.md'):
                md_path = os.path.join(self.download_path, filename)
                base_name = os.path.splitext(filename)[0]

                # Check if corresponding video exists
                video_path = self._find_video_file(self.download_path, base_name)

                if video_path:
                    # Parse metadata from .md file
                    video_info = self.metadata_service.parse_metadata(md_path)
                    video_info['id'] = base_name
                    video_info['filepath'] = video_path
                    video_info['filename'] = os.path.basename(video_path)
                    video_info['folder'] = ''
                    videos.append(video_info)

        # Sort by modification time (newest first)
        videos.sort(key=lambda x: self._get_mtime(x['filepath']), reverse=True)

        return videos

    def _get_library_from_folder_structure(self, folder: str = None) -> List[Dict[str, Any]]:
        """Get videos from the new folder structure (video_id based)

        Uses metadata files as the primary source, with file existence checks
        to determine has_video/has_audio flags.

        Args:
            folder: Optional folder name to filter by

        Returns:
            List of video information dictionaries
        """
        videos = []

        # Scan metadata folder as primary source
        if not folder_manager.is_configured() or not os.path.isdir(folder_manager.metadata_path):
            return videos

        for md_filename in os.listdir(folder_manager.metadata_path):
            if not md_filename.endswith('.md'):
                continue

            video_id = os.path.splitext(md_filename)[0]
            md_path = os.path.join(folder_manager.metadata_path, md_filename)
            video_info = self.metadata_service.parse_metadata(md_path)

            # Get files from metadata
            files = video_info.get('files', [])

            # Determine has_video and has_audio from files list
            has_video = False
            has_audio = False
            primary_folder = None
            primary_filename = None
            primary_filepath = None

            for f in files:
                if f.get('type') == 'video':
                    has_video = True
                    if not primary_folder:
                        primary_folder = f.get('folder', '00_Inbox')
                        primary_filename = f.get('filename')
                        folder_path = folder_manager.get_folder_path(primary_folder)
                        if folder_path and primary_filename:
                            primary_filepath = os.path.join(folder_path, primary_filename)
                elif f.get('type') == 'audio':
                    has_audio = True
                    if not primary_folder:
                        primary_folder = f.get('folder', '00_Inbox')
                        primary_filename = f.get('filename')
                        folder_path = folder_manager.get_folder_path(primary_folder)
                        if folder_path and primary_filename:
                            primary_filepath = os.path.join(folder_path, primary_filename)

            # If no files in metadata, check for existing files by scanning folders
            # This handles backward compatibility with old metadata format
            if not files or (len(files) == 1 and files[0].get('type') == '-'):
                has_video, has_audio, primary_folder, primary_filename, primary_filepath = \
                    self._find_files_for_video_id(video_id, video_info.get('title', ''))

            # Apply folder filter
            if folder and primary_folder != folder:
                # Check if any file is in the target folder
                in_target_folder = False
                for f in files:
                    if f.get('folder') == folder:
                        in_target_folder = True
                        break
                if not in_target_folder and primary_folder != folder:
                    continue

            # Determine link_only status
            link_only = not has_video and not has_audio

            # Build video info
            video_info['id'] = video_id
            video_info['video_id'] = video_id
            video_info['has_video'] = has_video
            video_info['has_audio'] = has_audio
            video_info['link_only'] = link_only
            video_info['folder'] = primary_folder or config.default_folder
            video_info['filename'] = primary_filename or video_id
            video_info['filepath'] = primary_filepath or md_path
            video_info['is_audio'] = has_audio and not has_video

            # Check for local thumbnail
            thumbnail_path = os.path.join(folder_manager.thumbnails_path, video_id + '.jpg')
            video_info['local_thumbnail'] = os.path.exists(thumbnail_path)

            # Detect platform if not in metadata or is 'other'
            if not video_info.get('platform') or video_info.get('platform') == 'other':
                detected = self.metadata_service._detect_platform(video_info.get('url', ''))
                if detected != 'other':
                    video_info['platform'] = detected

            videos.append(video_info)

        # Sort by modification time (newest first)
        videos.sort(key=lambda x: self._get_mtime(x['filepath']), reverse=True)

        return videos

    def _find_files_for_video_id(
        self,
        video_id: str,
        title: str = ''
    ) -> tuple:
        """Find video/audio files for a video_id (backward compatibility)

        Args:
            video_id: The video ID
            title: The video title (for matching old filename-based files)

        Returns:
            Tuple of (has_video, has_audio, folder, filename, filepath)
        """
        has_video = False
        has_audio = False
        primary_folder = None
        primary_filename = None
        primary_filepath = None

        # Get all folders
        folders = folder_manager.get_folders()

        for folder_info in folders:
            folder_name = folder_info['name']
            folder_path = folder_manager.get_folder_path(folder_name)
            if not folder_path or not os.path.isdir(folder_path):
                continue

            for filename in os.listdir(folder_path):
                base_name = os.path.splitext(filename)[0]

                # Match by video_id or title
                if base_name == video_id or (title and base_name == title):
                    filepath = os.path.join(folder_path, filename)
                    ext = os.path.splitext(filename)[1].lower()

                    if ext in ('.mp4', '.webm', '.mkv'):
                        has_video = True
                        if not primary_folder:
                            primary_folder = folder_name
                            primary_filename = filename
                            primary_filepath = filepath
                    elif ext == '.mp3':
                        has_audio = True
                        if not primary_folder:
                            primary_folder = folder_name
                            primary_filename = filename
                            primary_filepath = filepath

        return has_video, has_audio, primary_folder, primary_filename, primary_filepath

    def get_all_tags(self) -> List[str]:
        """Get all unique tags from all videos

        Returns:
            Sorted list of unique tags
        """
        all_tags: Set[str] = set()

        # Get metadata path to scan
        if folder_manager.is_configured():
            metadata_path = folder_manager.metadata_path
        else:
            metadata_path = self.download_path

        if not os.path.isdir(metadata_path):
            return []

        for filename in os.listdir(metadata_path):
            if filename.endswith('.md'):
                md_path = os.path.join(metadata_path, filename)
                info = self.metadata_service.parse_metadata(md_path)
                all_tags.update(info.get('tags', []))

        return sorted(list(all_tags))

    def get_video_by_id(self, video_id: str, folder: str = None) -> Optional[Dict[str, Any]]:
        """Get a specific video by its ID

        Args:
            video_id: The video ID (base filename without extension)
            folder: Optional folder name to search in

        Returns:
            Video information dictionary or None
        """
        if folder_manager.is_configured():
            # Search in specific folder or all folders
            if folder:
                folders_to_search = [folder]
            else:
                folders = folder_manager.get_folders()
                folders_to_search = [f['name'] for f in folders]

            for folder_name in folders_to_search:
                folder_path = folder_manager.get_folder_path(folder_name)
                if not folder_path:
                    continue

                video_path = self._find_video_file(folder_path, video_id)
                if video_path:
                    md_path = os.path.join(folder_manager.metadata_path, video_id + '.md')
                    if os.path.exists(md_path):
                        video_info = self.metadata_service.parse_metadata(md_path)
                    else:
                        video_info = self._create_default_video_info(video_id)

                    video_info['id'] = video_id
                    video_info['filepath'] = video_path
                    video_info['filename'] = os.path.basename(video_path)
                    video_info['folder'] = folder_name
                    return video_info

            # Check for link-only items
            md_path = os.path.join(folder_manager.metadata_path, video_id + '.md')
            if os.path.exists(md_path):
                video_info = self.metadata_service.parse_metadata(md_path)
                if video_info.get('link_only'):
                    video_info['id'] = video_id
                    video_info['filepath'] = md_path
                    video_info['filename'] = video_id
                    video_info['folder'] = video_info.get('folder', config.default_folder)
                    return video_info
        else:
            # Search in single download folder
            video_path = self._find_video_file(self.download_path, video_id)
            if video_path:
                md_path = os.path.join(self.download_path, video_id + '.md')
                if os.path.exists(md_path):
                    video_info = self.metadata_service.parse_metadata(md_path)
                else:
                    video_info = self._create_default_video_info(video_id)

                video_info['id'] = video_id
                video_info['filepath'] = video_path
                video_info['filename'] = os.path.basename(video_path)
                video_info['folder'] = ''
                return video_info

        return None

    def count_videos(self, folder: str = None) -> int:
        """Count videos in library

        Args:
            folder: Optional folder name to count in

        Returns:
            Number of videos
        """
        return len(self.get_video_library(folder))

    def _find_video_file(self, folder_path: str, base_name: str) -> Optional[str]:
        """Find video file with matching base name

        Args:
            folder_path: Folder to search in
            base_name: Base filename without extension

        Returns:
            Full path to video file or None
        """
        for ext in ['.mp4', '.webm', '.mkv', '.mp3']:
            potential_path = os.path.join(folder_path, base_name + ext)
            if os.path.exists(potential_path):
                return potential_path
        return None

    def _create_default_video_info(self, base_name: str) -> Dict[str, Any]:
        """Create default video info when no metadata exists

        Args:
            base_name: Base filename without extension

        Returns:
            Default video info dictionary
        """
        return {
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

    @staticmethod
    def _get_mtime(filepath: str) -> float:
        """Safely get file modification time

        Args:
            filepath: Path to file

        Returns:
            Modification time or 0 if error
        """
        try:
            return os.path.getmtime(filepath)
        except:
            return 0
