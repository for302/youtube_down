"""
Settings routes for ClickClipDown.
Handles application settings and configuration.
"""
import os
import sys
import subprocess
from flask import Blueprint, request, jsonify

from config import config
from folder_manager import folder_manager
from version import __version__, __app_name__
from .download import get_downloader

settings_bp = Blueprint('settings', __name__)


@settings_bp.route('/api/settings', methods=['GET'])
def get_settings():
    """Get all settings"""
    return jsonify({
        'success': True,
        'settings': config.get_all()
    })


@settings_bp.route('/api/settings', methods=['POST'])
def save_settings():
    """Save settings"""
    data = request.get_json()

    # Handle content path change
    if 'content_path' in data:
        new_path = data['content_path']
        if new_path and os.path.isdir(new_path):
            old_path = config.content_path
            config.content_path = new_path
            folder_manager.initialize_structure(new_path)

            # Migrate existing videos if there's an old path
            if old_path and old_path != new_path and os.path.isdir(old_path):
                folder_manager.migrate_existing_videos(old_path)

    # Handle theme change
    if 'theme' in data:
        config.theme = data['theme']

    # Handle default folder change
    if 'default_folder' in data:
        config.default_folder = data['default_folder']

    return jsonify({
        'success': True,
        'settings': config.get_all()
    })


@settings_bp.route('/api/version')
def get_version():
    """Get current app version"""
    return jsonify({
        'success': True,
        'version': __version__,
        'app_name': __app_name__
    })


@settings_bp.route('/api/open-folder', methods=['POST'])
def open_folder():
    """Open download folder or file location"""
    downloader = get_downloader()
    data = request.get_json()
    filepath = data.get('filepath', downloader.download_path)

    try:
        if os.path.isfile(filepath):
            # Open folder and select file
            if sys.platform == 'win32':
                subprocess.run(['explorer', '/select,', filepath])
            elif sys.platform == 'darwin':
                subprocess.run(['open', '-R', filepath])
            else:
                subprocess.run(['xdg-open', os.path.dirname(filepath)])
        else:
            # Open folder
            folder = filepath if os.path.isdir(filepath) else downloader.download_path
            if sys.platform == 'win32':
                os.startfile(folder)
            elif sys.platform == 'darwin':
                subprocess.run(['open', folder])
            else:
                subprocess.run(['xdg-open', folder])

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@settings_bp.route('/api/open-file-location', methods=['POST'])
def open_file_location():
    """Open the folder containing a specific file"""
    data = request.get_json()
    folder = data.get('folder', '')
    filename = data.get('filename', '')

    folder_path = folder_manager.get_folder_path(folder)
    if not folder_path:
        return jsonify({'success': False, 'error': 'Folder not configured'})

    filepath = os.path.join(folder_path, filename)

    try:
        if os.path.isfile(filepath):
            if sys.platform == 'win32':
                subprocess.run(['explorer', '/select,', filepath])
            elif sys.platform == 'darwin':
                subprocess.run(['open', '-R', filepath])
            else:
                subprocess.run(['xdg-open', os.path.dirname(filepath)])
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'File not found'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@settings_bp.route('/api/open-content-folder', methods=['POST'])
def open_content_folder():
    """Open the content folder in file explorer"""
    data = request.get_json()
    path = data.get('path', config.content_path)

    if not path or not os.path.isdir(path):
        return jsonify({'success': False, 'error': 'Invalid path'})

    try:
        if sys.platform == 'win32':
            os.startfile(path)
        elif sys.platform == 'darwin':
            subprocess.run(['open', path])
        else:
            subprocess.run(['xdg-open', path])
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
