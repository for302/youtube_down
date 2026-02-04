"""
File utility functions for YouTube Downloader
"""
import os
import sys
import re
import subprocess


def sanitize_filename(filename: str) -> str:
    """Remove invalid characters from filename

    Args:
        filename: The filename to sanitize

    Returns:
        Sanitized filename safe for all platforms
    """
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


def open_folder_in_explorer(folder_path: str) -> bool:
    """Open a folder in the system file explorer

    Args:
        folder_path: Path to the folder to open

    Returns:
        True if successful, False otherwise
    """
    try:
        if not os.path.isdir(folder_path):
            return False

        if sys.platform == 'win32':
            os.startfile(folder_path)
        elif sys.platform == 'darwin':
            subprocess.run(['open', folder_path])
        else:
            subprocess.run(['xdg-open', folder_path])
        return True
    except Exception as e:
        print(f"Error opening folder: {e}")
        return False


def open_file_location(filepath: str) -> bool:
    """Open the folder containing a file and select it in the file explorer

    Args:
        filepath: Path to the file to reveal

    Returns:
        True if successful, False otherwise
    """
    try:
        if os.path.isfile(filepath):
            # Open folder and select file
            if sys.platform == 'win32':
                subprocess.run(['explorer', '/select,', filepath])
            elif sys.platform == 'darwin':
                subprocess.run(['open', '-R', filepath])
            else:
                subprocess.run(['xdg-open', os.path.dirname(filepath)])
            return True
        elif os.path.isdir(filepath):
            # Just open the folder
            return open_folder_in_explorer(filepath)
        else:
            return False
    except Exception as e:
        print(f"Error opening file location: {e}")
        return False
