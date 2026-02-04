"""
Update routes for ClickClipDown.
Handles application updates from GitHub releases.
"""
import os
import sys
import subprocess
import threading
import tempfile
from flask import Blueprint, request, jsonify
import requests
from packaging import version as pkg_version

from version import __version__, __github_repo__
from .shared import (
    get_update_progress_store,
    reset_update_progress_store,
    update_update_progress_store_data
)

update_bp = Blueprint('update', __name__)


@update_bp.route('/api/check-update')
def check_update():
    """Check for updates from GitHub releases"""
    try:
        url = f"https://api.github.com/repos/{__github_repo__}/releases/latest"
        response = requests.get(url, timeout=10)

        if response.status_code == 404:
            return jsonify({
                'success': True,
                'has_update': False,
                'current': __version__,
                'message': 'No releases found'
            })

        if response.ok:
            latest = response.json()
            latest_version = latest['tag_name'].lstrip('v')

            try:
                has_update = pkg_version.parse(latest_version) > pkg_version.parse(__version__)
            except:
                has_update = False

            # Find installer asset (prefer exe, fallback to msi)
            download_url = None
            asset_name = None
            for asset in latest.get('assets', []):
                name = asset['name']
                # Support both .exe and .msi installers
                if (name.endswith('.exe') and 'Setup' in name) or name.endswith('.msi'):
                    download_url = asset['browser_download_url']
                    asset_name = name
                    # Prefer .exe if available, but accept .msi
                    if name.endswith('.exe'):
                        break

            return jsonify({
                'success': True,
                'current': __version__,
                'latest': latest_version,
                'has_update': has_update,
                'download_url': download_url,
                'asset_name': asset_name,
                'release_notes': latest.get('body', ''),
                'release_url': latest.get('html_url', '')
            })
        else:
            return jsonify({
                'success': False,
                'error': f'GitHub API error: {response.status_code}'
            })
    except requests.exceptions.Timeout:
        return jsonify({
            'success': False,
            'error': 'Connection timeout'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })


@update_bp.route('/api/download-update', methods=['POST'])
def download_update():
    """Download update installer"""
    data = request.get_json()
    download_url = data.get('download_url', '')
    asset_name = data.get('asset_name', 'ClickClipDown_Setup.exe')

    if not download_url:
        return jsonify({'success': False, 'error': 'Download URL is required'})

    # Reset progress
    reset_update_progress_store()

    def download_installer():
        try:
            # Create temp directory for download
            temp_dir = tempfile.gettempdir()
            filepath = os.path.join(temp_dir, asset_name)

            # Download with progress
            response = requests.get(download_url, stream=True, timeout=300)
            total_size = int(response.headers.get('content-length', 0))
            downloaded_size = 0

            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded_size += len(chunk)
                        if total_size > 0:
                            progress = int((downloaded_size / total_size) * 100)
                            update_update_progress_store_data({
                                'status': 'downloading',
                                'progress': progress,
                                'message': f'Downloading... {downloaded_size // 1024 // 1024}MB / {total_size // 1024 // 1024}MB'
                            })

            update_update_progress_store_data({
                'status': 'completed',
                'progress': 100,
                'message': 'Download completed',
                'filepath': filepath
            })
        except Exception as e:
            update_update_progress_store_data({
                'status': 'error',
                'message': str(e)
            })

    # Start download in background
    thread = threading.Thread(target=download_installer)
    thread.daemon = True
    thread.start()

    return jsonify({'success': True, 'message': 'Download started'})


@update_bp.route('/api/update-progress')
def get_update_progress():
    """Get update download progress"""
    return jsonify(get_update_progress_store())


@update_bp.route('/api/install-update', methods=['POST'])
def install_update():
    """Launch installer and exit app"""
    update_progress_store = get_update_progress_store()
    filepath = update_progress_store.get('filepath', '')

    if not filepath or not os.path.isfile(filepath):
        return jsonify({'success': False, 'error': 'Installer not found'})

    try:
        # Launch installer
        if sys.platform == 'win32':
            if filepath.endswith('.msi'):
                # MSI files need to be run with msiexec
                subprocess.Popen(
                    ['msiexec', '/i', filepath],
                    creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
                    close_fds=True
                )
            else:
                # EXE files can be run directly
                subprocess.Popen(
                    [filepath],
                    creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
                    close_fds=True
                )
        else:
            subprocess.Popen([filepath], start_new_session=True)

        # Exit app after small delay
        def exit_app():
            import time
            time.sleep(1)
            os._exit(0)

        thread = threading.Thread(target=exit_app)
        thread.daemon = True
        thread.start()

        return jsonify({'success': True, 'message': 'Installer launched, app will exit'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
