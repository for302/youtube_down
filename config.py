"""
Configuration Manager for YouTube Downloader
Handles persistent settings storage using JSON
"""
import os
import sys
import json
from typing import Any, Optional


def get_config_dir() -> str:
    """Get the configuration directory path based on platform"""
    if sys.platform == 'win32':
        # Windows: %APPDATA%/ClickClipDown
        base = os.environ.get('APPDATA', os.path.expanduser('~'))
        return os.path.join(base, 'ClickClipDown')
    elif sys.platform == 'darwin':
        # macOS: ~/Library/Application Support/ClickClipDown
        return os.path.join(os.path.expanduser('~'), 'Library', 'Application Support', 'ClickClipDown')
    else:
        # Linux: ~/.config/ClickClipDown
        return os.path.join(os.path.expanduser('~'), '.config', 'ClickClipDown')


class ConfigManager:
    """Manages application configuration with JSON persistence"""

    DEFAULT_SETTINGS = {
        'content_path': '',  # Empty means not configured
        'theme': 'light',  # 'light' or 'dark'
        'default_folder': '00_Inbox',
        'developer_mode': False,  # Developer tools enabled
    }

    def __init__(self):
        self.config_dir = get_config_dir()
        self.config_file = os.path.join(self.config_dir, 'settings.json')
        self._settings = {}
        self._ensure_config_dir()
        self._load_settings()

    def _ensure_config_dir(self):
        """Ensure the configuration directory exists"""
        if not os.path.exists(self.config_dir):
            os.makedirs(self.config_dir, exist_ok=True)

    def _load_settings(self):
        """Load settings from JSON file"""
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    self._settings = json.load(f)
            except (json.JSONDecodeError, IOError):
                self._settings = {}

        # Merge with defaults for any missing keys
        for key, value in self.DEFAULT_SETTINGS.items():
            if key not in self._settings:
                self._settings[key] = value

    def _save_settings(self):
        """Save settings to JSON file"""
        self._ensure_config_dir()
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self._settings, f, indent=2, ensure_ascii=False)
            return True
        except IOError:
            return False

    def get(self, key: str, default: Any = None) -> Any:
        """Get a setting value"""
        return self._settings.get(key, default if default is not None else self.DEFAULT_SETTINGS.get(key))

    def set(self, key: str, value: Any) -> bool:
        """Set a setting value and save"""
        self._settings[key] = value
        return self._save_settings()

    def get_all(self) -> dict:
        """Get all settings"""
        return self._settings.copy()

    def update(self, settings: dict) -> bool:
        """Update multiple settings at once"""
        self._settings.update(settings)
        return self._save_settings()

    @property
    def content_path(self) -> str:
        """Get the content storage path"""
        return self.get('content_path', '')

    @content_path.setter
    def content_path(self, path: str):
        """Set the content storage path"""
        self.set('content_path', path)

    @property
    def theme(self) -> str:
        """Get the current theme"""
        return self.get('theme', 'light')

    @theme.setter
    def theme(self, value: str):
        """Set the theme"""
        if value in ('light', 'dark'):
            self.set('theme', value)

    @property
    def default_folder(self) -> str:
        """Get the default download folder"""
        return self.get('default_folder', '00_Inbox')

    @default_folder.setter
    def default_folder(self, value: str):
        """Set the default download folder"""
        self.set('default_folder', value)

    def is_configured(self) -> bool:
        """Check if the content path is configured"""
        path = self.content_path
        return bool(path) and os.path.isdir(path)


# Global config instance
config = ConfigManager()
