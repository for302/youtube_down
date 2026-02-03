"""
Folder Manager for YouTube Downloader
Handles folder structure, CRUD operations, and video management
"""
import os
import shutil
from typing import List, Dict, Optional, Tuple

from config import config


class FolderManager:
    """Manages folder structure for video and metadata storage"""

    VIDEOS_DIR = 'videos'
    METADATA_DIR = 'metadata'

    def __init__(self):
        self._content_path = None

    @property
    def default_folder(self) -> str:
        """Get the default folder name from config"""
        return config.default_folder or '00_Inbox'

    @property
    def content_path(self) -> str:
        """Get the current content path from config"""
        return config.content_path

    @property
    def videos_path(self) -> str:
        """Get the videos directory path"""
        if not self.content_path:
            return ''
        return os.path.join(self.content_path, self.VIDEOS_DIR)

    @property
    def metadata_path(self) -> str:
        """Get the metadata directory path"""
        if not self.content_path:
            return ''
        return os.path.join(self.content_path, self.METADATA_DIR)

    @property
    def thumbnails_path(self) -> str:
        """Get the thumbnails directory path"""
        if not self.content_path:
            return ''
        return os.path.join(self.content_path, 'thumbnails')

    def is_configured(self) -> bool:
        """Check if content path is configured and valid"""
        return config.is_configured()

    def initialize_structure(self, path: str = None, default_folder_name: str = None) -> bool:
        """
        Initialize the folder structure at the given path.
        Creates videos/, metadata/, and default folder.
        """
        if path:
            config.content_path = path

        if default_folder_name:
            config.default_folder = default_folder_name

        if not self.content_path:
            return False

        try:
            # Create main directories
            os.makedirs(self.videos_path, exist_ok=True)
            os.makedirs(self.metadata_path, exist_ok=True)
            os.makedirs(self.thumbnails_path, exist_ok=True)

            # Create default inbox folder
            inbox_path = os.path.join(self.videos_path, self.default_folder)
            os.makedirs(inbox_path, exist_ok=True)

            return True
        except OSError:
            return False

    def get_folders(self) -> List[Dict]:
        """
        Get list of all folders in the videos directory.
        Returns a list of dicts with folder info.
        """
        folders = []

        if not self.is_configured():
            return folders

        try:
            for name in os.listdir(self.videos_path):
                folder_path = os.path.join(self.videos_path, name)
                if os.path.isdir(folder_path):
                    # Count videos in folder
                    video_count = self._count_videos_in_folder(folder_path)
                    folders.append({
                        'name': name,
                        'path': folder_path,
                        'video_count': video_count,
                        'is_default': name == self.default_folder
                    })

            # Sort folders: 00_Inbox first, then alphabetically
            folders.sort(key=lambda x: (not x['is_default'], x['name'].lower()))

        except OSError:
            pass

        return folders

    def _count_videos_in_folder(self, folder_path: str) -> int:
        """Count video files in a folder"""
        count = 0
        video_extensions = ('.mp4', '.webm', '.mkv', '.mp3')
        try:
            for filename in os.listdir(folder_path):
                if filename.lower().endswith(video_extensions):
                    count += 1
        except OSError:
            pass
        return count

    def create_folder(self, name: str) -> Tuple[bool, str]:
        """
        Create a new folder in the videos directory.
        Returns (success, message).
        """
        if not self.is_configured():
            return False, '컨텐츠 폴더가 설정되지 않았습니다.'

        # Validate folder name
        if not name or not name.strip():
            return False, '폴더 이름을 입력해주세요.'

        # Sanitize folder name
        sanitized_name = self._sanitize_folder_name(name.strip())
        if not sanitized_name:
            return False, '유효하지 않은 폴더 이름입니다.'

        folder_path = os.path.join(self.videos_path, sanitized_name)

        if os.path.exists(folder_path):
            return False, '이미 존재하는 폴더입니다.'

        try:
            os.makedirs(folder_path)
            return True, sanitized_name
        except OSError as e:
            return False, f'폴더 생성 실패: {str(e)}'

    def rename_folder(self, old_name: str, new_name: str) -> Tuple[bool, str]:
        """
        Rename a folder.
        Returns (success, message).
        """
        if not self.is_configured():
            return False, '컨텐츠 폴더가 설정되지 않았습니다.'

        # Cannot rename default inbox (only through rename_default_folder)
        if old_name == self.default_folder:
            return False, '기본 폴더는 Settings에서 이름을 변경해주세요.'

        if not new_name or not new_name.strip():
            return False, '새 폴더 이름을 입력해주세요.'

        sanitized_name = self._sanitize_folder_name(new_name.strip())
        if not sanitized_name:
            return False, '유효하지 않은 폴더 이름입니다.'

        old_path = os.path.join(self.videos_path, old_name)
        new_path = os.path.join(self.videos_path, sanitized_name)

        if not os.path.exists(old_path):
            return False, '폴더를 찾을 수 없습니다.'

        if os.path.exists(new_path):
            return False, '이미 존재하는 폴더 이름입니다.'

        try:
            os.rename(old_path, new_path)
            return True, sanitized_name
        except OSError as e:
            return False, f'폴더 이름 변경 실패: {str(e)}'

    def delete_folder(self, name: str) -> Tuple[bool, str]:
        """
        Delete a folder and move its videos to 00_Inbox.
        Returns (success, message).
        """
        if not self.is_configured():
            return False, '컨텐츠 폴더가 설정되지 않았습니다.'

        # Cannot delete default inbox
        if name == self.default_folder:
            return False, '기본 폴더는 삭제할 수 없습니다.'

        folder_path = os.path.join(self.videos_path, name)
        inbox_path = os.path.join(self.videos_path, self.default_folder)

        if not os.path.exists(folder_path):
            return False, '폴더를 찾을 수 없습니다.'

        try:
            # Move all videos to inbox
            moved_count = 0
            for filename in os.listdir(folder_path):
                src = os.path.join(folder_path, filename)
                if os.path.isfile(src):
                    dst = os.path.join(inbox_path, filename)
                    # Handle duplicate filenames
                    if os.path.exists(dst):
                        base, ext = os.path.splitext(filename)
                        counter = 1
                        while os.path.exists(dst):
                            dst = os.path.join(inbox_path, f"{base}_{counter}{ext}")
                            counter += 1
                    shutil.move(src, dst)
                    moved_count += 1

            # Remove the empty folder
            os.rmdir(folder_path)

            return True, f'{moved_count}개의 동영상이 {self.default_folder}로 이동되었습니다.'
        except OSError as e:
            return False, f'폴더 삭제 실패: {str(e)}'

    def move_video(self, video_filename: str, source_folder: str, target_folder: str) -> Tuple[bool, str]:
        """
        Move a video file from one folder to another.
        Also moves the corresponding metadata file.
        Returns (success, message).
        """
        if not self.is_configured():
            return False, '컨텐츠 폴더가 설정되지 않았습니다.'

        if source_folder == target_folder:
            return False, '같은 폴더로 이동할 수 없습니다.'

        source_path = os.path.join(self.videos_path, source_folder, video_filename)
        target_dir = os.path.join(self.videos_path, target_folder)
        target_path = os.path.join(target_dir, video_filename)

        if not os.path.exists(source_path):
            return False, '동영상 파일을 찾을 수 없습니다.'

        if not os.path.isdir(target_dir):
            return False, '대상 폴더가 존재하지 않습니다.'

        try:
            # Handle duplicate filenames
            if os.path.exists(target_path):
                base, ext = os.path.splitext(video_filename)
                counter = 1
                while os.path.exists(target_path):
                    new_filename = f"{base}_{counter}{ext}"
                    target_path = os.path.join(target_dir, new_filename)
                    counter += 1

            # Move video file
            shutil.move(source_path, target_path)

            return True, '동영상이 이동되었습니다.'
        except OSError as e:
            return False, f'동영상 이동 실패: {str(e)}'

    def get_folder_path(self, folder_name: str) -> str:
        """Get the full path for a folder"""
        if not self.is_configured():
            return ''
        return os.path.join(self.videos_path, folder_name)

    def migrate_existing_videos(self, old_path: str) -> Tuple[bool, int]:
        """
        Migrate existing videos from old download path to new structure.
        Moves videos to 00_Inbox and metadata to metadata folder.
        Returns (success, count).
        """
        if not self.is_configured():
            return False, 0

        if not os.path.isdir(old_path):
            return False, 0

        inbox_path = os.path.join(self.videos_path, self.default_folder)
        os.makedirs(inbox_path, exist_ok=True)
        os.makedirs(self.metadata_path, exist_ok=True)

        migrated_count = 0
        video_extensions = ('.mp4', '.webm', '.mkv', '.mp3')

        try:
            for filename in os.listdir(old_path):
                src = os.path.join(old_path, filename)
                if not os.path.isfile(src):
                    continue

                lower_filename = filename.lower()

                if lower_filename.endswith(video_extensions):
                    # Move video to inbox
                    dst = os.path.join(inbox_path, filename)
                    if not os.path.exists(dst):
                        shutil.move(src, dst)
                        migrated_count += 1

                elif lower_filename.endswith('.md'):
                    # Move metadata to metadata folder
                    dst = os.path.join(self.metadata_path, filename)
                    if not os.path.exists(dst):
                        shutil.move(src, dst)

            return True, migrated_count
        except OSError:
            return False, migrated_count

    def rename_default_folder(self, new_name: str) -> Tuple[bool, str]:
        """
        Rename the default folder.
        Returns (success, message).
        """
        if not self.is_configured():
            return False, '컨텐츠 폴더가 설정되지 않았습니다.'

        if not new_name or not new_name.strip():
            return False, '새 폴더 이름을 입력해주세요.'

        sanitized_name = self._sanitize_folder_name(new_name.strip())
        if not sanitized_name:
            return False, '유효하지 않은 폴더 이름입니다.'

        old_name = self.default_folder
        if old_name == sanitized_name:
            return True, '폴더 이름이 동일합니다.'

        old_path = os.path.join(self.videos_path, old_name)
        new_path = os.path.join(self.videos_path, sanitized_name)

        try:
            # If old folder exists, rename it
            if os.path.exists(old_path):
                if os.path.exists(new_path):
                    return False, '이미 존재하는 폴더 이름입니다.'
                os.rename(old_path, new_path)
            else:
                # Create new folder if old doesn't exist
                os.makedirs(new_path, exist_ok=True)

            # Update config
            config.default_folder = sanitized_name

            return True, f'기본 폴더가 {sanitized_name}(으)로 변경되었습니다.'
        except OSError as e:
            return False, f'폴더 이름 변경 실패: {str(e)}'

    def _sanitize_folder_name(self, name: str) -> str:
        """Remove invalid characters from folder name"""
        # Remove characters that are invalid in Windows folder names
        invalid_chars = '<>:"/\\|?*'
        sanitized = ''.join(c for c in name if c not in invalid_chars)
        # Remove control characters
        sanitized = ''.join(c for c in sanitized if ord(c) >= 32)
        # Trim whitespace and dots from ends
        sanitized = sanitized.strip('. ')
        # Limit length
        if len(sanitized) > 255:
            sanitized = sanitized[:255]
        return sanitized


# Global folder manager instance
folder_manager = FolderManager()
