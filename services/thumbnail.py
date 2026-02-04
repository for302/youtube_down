"""
Thumbnail service for downloading and managing video thumbnails
"""
import os
import urllib.request
from typing import Dict, Any, Optional

from folder_manager import folder_manager


class ThumbnailService:
    """Service for downloading and managing video thumbnails"""

    def __init__(self, fallback_path: str = None):
        """Initialize thumbnail service

        Args:
            fallback_path: Fallback path when folder_manager is not configured
        """
        self.fallback_path = fallback_path or os.path.join(
            os.path.expanduser('~'), 'Downloads'
        )

    def save_thumbnail(
        self,
        video_id: str,
        info: Dict[str, Any] = None,
        thumbnail_url: str = None
    ) -> Optional[str]:
        """Download and save thumbnail image

        Args:
            video_id: The unique video ID (used for naming)
            info: Video info dictionary containing 'thumbnail' key
            thumbnail_url: Direct thumbnail URL (overrides info)

        Returns:
            Path to saved thumbnail or None if failed
        """
        # Get thumbnail URL
        url = thumbnail_url
        if not url and info:
            url = info.get('thumbnail', '')
        if not url:
            return None

        # Check if thumbnail already exists
        if self.thumbnail_exists(video_id):
            return self.get_thumbnail_path(video_id)

        # Determine where to save thumbnail
        if folder_manager.is_configured():
            thumbnails_dir = folder_manager.thumbnails_path
            os.makedirs(thumbnails_dir, exist_ok=True)
            thumbnail_path = os.path.join(thumbnails_dir, video_id + '.jpg')
        else:
            # Fallback path
            thumbnail_path = os.path.join(self.fallback_path, video_id + '_thumb.jpg')

        try:
            # Download thumbnail
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'Mozilla/5.0'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                with open(thumbnail_path, 'wb') as f:
                    f.write(response.read())
            return thumbnail_path
        except Exception as e:
            print(f"Error saving thumbnail: {e}")
            return None

    def get_thumbnail_path(self, video_id: str) -> Optional[str]:
        """Get the path to a thumbnail if it exists

        Args:
            video_id: The video ID (base filename without extension)

        Returns:
            Path to thumbnail if it exists, None otherwise
        """
        if folder_manager.is_configured():
            thumbnail_path = os.path.join(folder_manager.thumbnails_path, video_id + '.jpg')
        else:
            thumbnail_path = os.path.join(self.fallback_path, video_id + '_thumb.jpg')

        if os.path.exists(thumbnail_path):
            return thumbnail_path
        return None

    def thumbnail_exists(self, video_id: str) -> bool:
        """Check if a thumbnail exists for a video

        Args:
            video_id: The video ID (base filename without extension)

        Returns:
            True if thumbnail exists
        """
        return self.get_thumbnail_path(video_id) is not None

    def delete_thumbnail(self, video_id: str) -> bool:
        """Delete a thumbnail file

        Args:
            video_id: The video ID (base filename without extension)

        Returns:
            True if deleted successfully
        """
        thumbnail_path = self.get_thumbnail_path(video_id)
        if thumbnail_path and os.path.exists(thumbnail_path):
            try:
                os.remove(thumbnail_path)
                return True
            except Exception as e:
                print(f"Error deleting thumbnail: {e}")
        return False
