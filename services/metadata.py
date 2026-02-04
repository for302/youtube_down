"""
Metadata service for managing video metadata files
"""
import os
import re
from datetime import datetime
from typing import Dict, Any, Optional, List

from folder_manager import folder_manager


class MetadataService:
    """Service for managing video metadata stored in markdown files"""

    def __init__(self, fallback_path: str = None):
        """Initialize metadata service

        Args:
            fallback_path: Fallback path when folder_manager is not configured
        """
        self.fallback_path = fallback_path or os.path.join(
            os.path.expanduser('~'), 'Downloads'
        )

    def _get_metadata_path(self, video_id: str) -> str:
        """Get the metadata file path for a video

        Args:
            video_id: The video ID (base filename without extension)

        Returns:
            Path to the metadata file
        """
        if folder_manager.is_configured():
            return os.path.join(folder_manager.metadata_path, video_id + '.md')
        return os.path.join(self.fallback_path, video_id + '.md')

    def save_metadata(
        self,
        video_id: str,
        info: Dict[str, Any],
        folder: str = None,
        file_type: str = None,
        filename: str = None
    ) -> Optional[str]:
        """Save video metadata as .md file

        Args:
            video_id: The unique video ID (from yt-dlp or URL hash)
            info: Video information dictionary
            folder: Folder name for the video
            file_type: Type of file ('video', 'audio', or None for link-only)
            filename: The actual filename if downloaded

        Returns:
            Path to saved metadata file or None if failed
        """
        if not info:
            return None

        # Determine where to save metadata (always use video_id as filename)
        if folder_manager.is_configured():
            md_filepath = os.path.join(folder_manager.metadata_path, video_id + '.md')
        else:
            md_filepath = os.path.join(self.fallback_path, video_id + '.md')

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

        # Build files table
        files_table = self._build_files_table(file_type, filename, folder)

        # Create markdown content
        md_content = f"""# {info.get('title', 'Unknown')}

## Basic Information

| Item | Content |
|------|---------|
| **Channel** | [{info.get('channel', 'Unknown')}]({info.get('channel_url', '#')}) |
| **Platform** | {info.get('platform', 'other')} |
| **Duration** | {info.get('duration_str', '')} |
| **Upload Date** | {upload_date} |
| **View Count** | {int(info.get('view_count', 0) or 0):,} |

## Tags

{tags_str}

## Files

{files_table}

## Links

- **Original URL**: {info.get('url', '')}
- **Channel URL**: {info.get('channel_url', '')}
- **Thumbnail**: {info.get('thumbnail', '')}

## Description

{info.get('description', 'No description')}

---
*Downloaded: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*
"""

        try:
            os.makedirs(os.path.dirname(md_filepath), exist_ok=True)
            with open(md_filepath, 'w', encoding='utf-8') as f:
                f.write(md_content)
            return md_filepath
        except Exception as e:
            print(f"Error saving metadata: {e}")
            return None

    def _build_files_table(
        self,
        file_type: str = None,
        filename: str = None,
        folder: str = None
    ) -> str:
        """Build files table for metadata

        Args:
            file_type: Type of file ('video', 'audio', or None)
            filename: The filename
            folder: The folder name

        Returns:
            Markdown table string
        """
        if not file_type or not filename:
            return "| Type | Filename | Folder |\n|------|----------|--------|\n| - | - | - |"

        return f"""| Type | Filename | Folder |
|------|----------|--------|
| {file_type} | {filename} | {folder or '00_Inbox'} |"""

    def add_file(self, video_id: str, file_type: str, filename: str, folder: str) -> bool:
        """Add a file entry to metadata

        Args:
            video_id: The video ID
            file_type: Type of file ('video' or 'audio')
            filename: The filename
            folder: The folder name

        Returns:
            True if successful
        """
        md_path = self._get_metadata_path(video_id)
        if not os.path.exists(md_path):
            return False

        try:
            with open(md_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Get existing files
            files = self.get_files(video_id)

            # Check if this file type already exists
            existing_idx = None
            for i, f in enumerate(files):
                if f['type'] == file_type:
                    existing_idx = i
                    break

            if existing_idx is not None:
                # Update existing entry
                files[existing_idx] = {'type': file_type, 'filename': filename, 'folder': folder}
            else:
                # Add new entry
                files.append({'type': file_type, 'filename': filename, 'folder': folder})

            # Build new files table
            new_table = self._build_files_table_from_list(files)

            # Replace files section
            content = re.sub(
                r'(## Files\n\n).*?(\n\n## Links)',
                rf'\g<1>{new_table}\g<2>',
                content,
                flags=re.DOTALL
            )

            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(content)

            return True
        except Exception as e:
            print(f"Error adding file to metadata: {e}")
            return False

    def remove_file(self, video_id: str, file_type: str) -> bool:
        """Remove a file entry from metadata

        Args:
            video_id: The video ID
            file_type: Type of file to remove ('video' or 'audio')

        Returns:
            True if successful
        """
        md_path = self._get_metadata_path(video_id)
        if not os.path.exists(md_path):
            return False

        try:
            with open(md_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Get existing files and filter out the specified type
            files = [f for f in self.get_files(video_id) if f['type'] != file_type]

            # Build new files table
            new_table = self._build_files_table_from_list(files)

            # Replace files section
            content = re.sub(
                r'(## Files\n\n).*?(\n\n## Links)',
                rf'\g<1>{new_table}\g<2>',
                content,
                flags=re.DOTALL
            )

            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(content)

            return True
        except Exception as e:
            print(f"Error removing file from metadata: {e}")
            return False

    def get_files(self, video_id: str) -> List[Dict[str, str]]:
        """Get list of files from metadata

        Args:
            video_id: The video ID

        Returns:
            List of file dictionaries with 'type', 'filename', 'folder' keys
        """
        md_path = self._get_metadata_path(video_id)
        if not os.path.exists(md_path):
            return []

        try:
            with open(md_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Extract files section
            files_match = re.search(r'## Files\n\n(.*?)\n\n## Links', content, re.DOTALL)
            if not files_match:
                return []

            files_section = files_match.group(1)
            files = []

            # Parse table rows (skip header rows)
            for line in files_section.split('\n'):
                if line.startswith('|') and not line.startswith('| Type') and not line.startswith('|---'):
                    parts = [p.strip() for p in line.split('|')]
                    if len(parts) >= 4 and parts[1] != '-':
                        files.append({
                            'type': parts[1],
                            'filename': parts[2],
                            'folder': parts[3]
                        })

            return files
        except Exception as e:
            print(f"Error getting files from metadata: {e}")
            return []

    def _build_files_table_from_list(self, files: List[Dict[str, str]]) -> str:
        """Build files table from list of file dictionaries

        Args:
            files: List of file dictionaries

        Returns:
            Markdown table string
        """
        if not files:
            return "| Type | Filename | Folder |\n|------|----------|--------|\n| - | - | - |"

        table = "| Type | Filename | Folder |\n|------|----------|--------|"
        for f in files:
            table += f"\n| {f['type']} | {f['filename']} | {f['folder']} |"
        return table

    def parse_metadata(self, md_path: str) -> Dict[str, Any]:
        """Parse metadata from .md file

        Args:
            md_path: Path to the metadata file

        Returns:
            Dictionary with parsed metadata
        """
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
            'files': [],
            'has_video': False,
            'has_audio': False,
        }

        try:
            with open(md_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Extract title (first # heading)
            title_match = re.search(r'^# (.+)$', content, re.MULTILINE)
            if title_match:
                info['title'] = title_match.group(1).strip()

            # Extract channel from table
            channel_match = re.search(r'\*\*Channel\*\* \| \[(.+?)\]\((.+?)\)', content)
            if not channel_match:
                # Try Korean format for backward compatibility
                channel_match = re.search(r'\*\*\ucc44\ub110\*\* \| \[(.+?)\]\((.+?)\)', content)
            if channel_match:
                info['channel'] = channel_match.group(1)
                info['channel_url'] = channel_match.group(2)

            # Extract platform (table format: | **Platform** | value |)
            platform_match = re.search(r'\*\*Platform\*\* \| ([^|]+)', content)
            if not platform_match:
                platform_match = re.search(r'\*\*\ud50c\ub7ab\ud3fc\*\* \| ([^|]+)', content)
            if platform_match:
                info['platform'] = platform_match.group(1).strip()

            # Extract duration
            duration_match = re.search(r'\*\*Duration\*\* \| (.+)', content)
            if not duration_match:
                duration_match = re.search(r'\*\*\uc7ac\uc0dd\uc2dc\uac04\*\* \| (.+)', content)
            if duration_match:
                info['duration_str'] = duration_match.group(1).strip()

            # Extract tags - handle both old format (## Tags...## Links) and new format (## Tags...## Files)
            tags_match = re.search(r'## Tags\n\n(.+?)\n\n##', content, re.DOTALL)
            if not tags_match:
                tags_match = re.search(r'## \ud0dc\uadf8\n\n(.+?)\n\n##', content, re.DOTALL)
            if tags_match:
                tags_str = tags_match.group(1).strip()
                if tags_str:
                    info['tags'] = [t.strip() for t in tags_str.split(',') if t.strip()]

            # Extract files from Files section (new format)
            files_match = re.search(r'## Files\n\n(.*?)\n\n## Links', content, re.DOTALL)
            if files_match:
                files_section = files_match.group(1)
                files = []
                for line in files_section.split('\n'):
                    if line.startswith('|') and not line.startswith('| Type') and not line.startswith('|---'):
                        parts = [p.strip() for p in line.split('|')]
                        if len(parts) >= 4 and parts[1] != '-':
                            files.append({
                                'type': parts[1],
                                'filename': parts[2],
                                'folder': parts[3]
                            })
                info['files'] = files
                info['has_video'] = any(f['type'] == 'video' for f in files)
                info['has_audio'] = any(f['type'] == 'audio' for f in files)
                # link_only is True if no files
                info['link_only'] = len(files) == 0 or (len(files) == 1 and files[0]['type'] == '-')

            # Extract URL (Original URL or YouTube URL for backwards compatibility)
            url_match = re.search(r'\*\*Original URL\*\*: (.+)', content)
            if not url_match:
                url_match = re.search(r'\*\*\uc6d0\ubcf8 URL\*\*: (.+)', content)
            if not url_match:
                url_match = re.search(r'\*\*YouTube URL\*\*: (.+)', content)
            if url_match:
                info['url'] = url_match.group(1).strip()

            # Extract thumbnail
            thumb_match = re.search(r'\*\*Thumbnail\*\*: (.+)', content)
            if not thumb_match:
                thumb_match = re.search(r'\*\*\uc378\ub124\uc77c\*\*: (.+)', content)
            if thumb_match:
                info['thumbnail'] = thumb_match.group(1).strip()

            # Extract description (after ## Description or Korean equivalent)
            desc_match = re.search(r'## Description\n\n(.+?)\n\n---', content, re.DOTALL)
            if not desc_match:
                desc_match = re.search(r'## \uc0c1\uc138 \uc815\ubcf4\n\n(.+?)\n\n---', content, re.DOTALL)
            if desc_match:
                info['description'] = desc_match.group(1).strip()

            # Check link_only flag (old format - backward compatibility)
            if '*Link only saved*' in content or '*\ub9c1\ud06c\ub9cc \uc800\uc7a5\ub428*' in content:
                info['link_only'] = True

        except Exception as e:
            print(f"Error parsing metadata: {e}")

        return info

    def update_metadata(self, video_id: str, updates: Dict[str, Any]) -> bool:
        """Update metadata fields (title, description)

        Args:
            video_id: The video ID (base filename without extension)
            updates: Dictionary of fields to update

        Returns:
            True if successful
        """
        md_path = self._get_metadata_path(video_id)

        # Try alternate path if not found
        if not os.path.exists(md_path):
            md_path = os.path.join(self.fallback_path, video_id + '.md')

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
                # Try English format first
                content = re.sub(
                    r'(## Description\n\n)(.+?)(\n\n---)',
                    rf'\g<1>{new_desc}\g<3>',
                    content,
                    flags=re.DOTALL
                )
                # Also try Korean format
                content = re.sub(
                    r'(## \uc0c1\uc138 \uc815\ubcf4\n\n)(.+?)(\n\n---)',
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

    def mark_as_downloaded(self, video_id: str) -> bool:
        """Update metadata to mark video as downloaded (remove link_only flag)

        Args:
            video_id: The video ID (base filename without extension)

        Returns:
            True if successful
        """
        md_path = self._get_metadata_path(video_id)
        if not os.path.exists(md_path):
            return False

        try:
            with open(md_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Remove link_only markers (both English and Korean)
            content = content.replace('\n*Link only saved*\n', '\n')
            content = content.replace('\n*\ub9c1\ud06c\ub9cc \uc800\uc7a5\ub428*\n', '\n')

            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(content)

            return True
        except Exception:
            return False

    def get_url_from_metadata(self, video_id: str) -> Optional[str]:
        """Get original URL from metadata file

        Args:
            video_id: The video ID (base filename without extension)

        Returns:
            Original URL or None if not found
        """
        md_path = self._get_metadata_path(video_id)

        # Try alternate path if not found
        if not os.path.exists(md_path):
            md_path = os.path.join(self.fallback_path, video_id + '.md')

        if not os.path.exists(md_path):
            return None

        info = self.parse_metadata(md_path)
        return info.get('url')

    def update_tags(self, video_id: str, tags: List[str]) -> bool:
        """Update tags in .md file

        Args:
            video_id: The video ID (base filename without extension)
            tags: List of tags to set

        Returns:
            True if successful
        """
        md_path = self._get_metadata_path(video_id)

        # Try alternate path
        if not os.path.exists(md_path):
            md_path = os.path.join(self.fallback_path, video_id + '.md')

        if not os.path.exists(md_path):
            return False

        try:
            with open(md_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Replace tags section
            tags_str = ', '.join(tags) if tags else ''

            # Try English format
            new_content = re.sub(
                r'(## Tags\n\n)(.+?)(\n\n## Links)',
                rf'\g<1>{tags_str}\g<3>',
                content,
                flags=re.DOTALL
            )

            # Also try Korean format
            new_content = re.sub(
                r'(## \ud0dc\uadf8\n\n)(.+?)(\n\n## \ub9c1\ud06c)',
                rf'\g<1>{tags_str}\g<3>',
                new_content,
                flags=re.DOTALL
            )

            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(new_content)

            return True
        except Exception as e:
            print(f"Error updating tags: {e}")
            return False

    def _extractor_to_platform(self, extractor: str) -> str:
        """Convert yt-dlp extractor name to platform name

        Args:
            extractor: yt-dlp extractor name

        Returns:
            Platform name or None if not found
        """
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

    def _detect_platform(self, url: str) -> str:
        """Detect platform from URL

        Args:
            url: Video URL

        Returns:
            Platform name string
        """
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
            'dailymotion': [r'dailymotion\.com', r'dai\.ly'],
            'naver': [r'naver\.com', r'tv\.naver\.com', r'clip\.naver\.com', r'naver\.me'],
            'pinterest': [r'pinterest\.com', r'pin\.it', r'pinimg\.com'],
            'reddit': [r'reddit\.com', r'redd\.it', r'v\.redd\.it', r'i\.redd\.it'],
            'soundcloud': [r'soundcloud\.com'],
        }

        for platform, regexes in patterns.items():
            for pattern in regexes:
                if re.search(pattern, url_lower):
                    return platform

        return 'other'

    def metadata_exists(self, video_id: str) -> bool:
        """Check if metadata exists for a video

        Args:
            video_id: The video ID (base filename without extension)

        Returns:
            True if metadata exists
        """
        md_path = self._get_metadata_path(video_id)
        if os.path.exists(md_path):
            return True

        # Check alternate path
        alt_path = os.path.join(self.fallback_path, video_id + '.md')
        return os.path.exists(alt_path)

    def delete_metadata(self, video_id: str) -> bool:
        """Delete metadata file

        Args:
            video_id: The video ID (base filename without extension)

        Returns:
            True if deleted successfully
        """
        md_path = self._get_metadata_path(video_id)

        # Try alternate path
        if not os.path.exists(md_path):
            md_path = os.path.join(self.fallback_path, video_id + '.md')

        if os.path.exists(md_path):
            try:
                os.remove(md_path)
                return True
            except Exception as e:
                print(f"Error deleting metadata: {e}")
        return False
