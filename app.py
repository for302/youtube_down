"""
YouTube Downloader Desktop Application
Flask + PyWebView based desktop app
"""
import os
import sys
import json
import subprocess
import threading
import webbrowser
import tempfile
from flask import Flask, render_template, request, jsonify, send_file, Response
import webview
import requests
from packaging import version as pkg_version

from downloader import YouTubeDownloader, download_async
from config import config
from folder_manager import folder_manager
from version import __version__, __app_name__, __github_repo__

# Flask app setup
app = Flask(__name__)
app.secret_key = 'youtube_downloader_secret_key'

# Global downloader instance
downloader = YouTubeDownloader()

# Store for progress updates
progress_store = {
    'status': 'idle',
    'progress': 0,
    'message': '',
    'filename': '',
    'filepath': ''
}

# Store for update download progress
update_progress_store = {
    'status': 'idle',
    'progress': 0,
    'message': '',
    'filepath': ''
}


def update_progress(data):
    """Update progress store with download status"""
    global progress_store
    progress_store.update(data)


@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')


@app.route('/api/info', methods=['POST'])
def get_video_info():
    """Get video information from URL"""
    data = request.get_json()
    url = data.get('url', '')

    if not url:
        return jsonify({'success': False, 'error': 'URL을 입력해주세요.'})

    result = downloader.get_video_info(url)
    return jsonify(result)


@app.route('/api/download', methods=['POST'])
def start_download():
    """Start download"""
    global progress_store

    data = request.get_json()
    url = data.get('url', '')
    download_type = data.get('type', 'video')  # 'video' or 'audio'
    resolution = data.get('resolution', '720p')
    bitrate = data.get('bitrate', '192')
    folder = data.get('folder', '00_Inbox')  # Target folder

    if not url:
        return jsonify({'success': False, 'error': 'URL을 입력해주세요.'})

    # Reset progress
    progress_store = {
        'status': 'starting',
        'progress': 0,
        'message': '다운로드 시작 중...',
        'filename': '',
        'filepath': ''
    }

    options = {
        'resolution': resolution,
        'bitrate': bitrate,
        'folder': folder
    }

    def on_complete(result):
        global progress_store
        if result['success']:
            progress_store.update({
                'status': 'completed',
                'progress': 100,
                'message': '다운로드 완료!',
                'filename': result['filename'],
                'filepath': result['filepath']
            })
        else:
            progress_store.update({
                'status': 'error',
                'message': result.get('error', '다운로드 실패')
            })

    download_async(
        downloader, url, download_type, options,
        progress_callback=update_progress,
        complete_callback=on_complete
    )

    return jsonify({'success': True, 'message': '다운로드가 시작되었습니다.'})


@app.route('/api/progress')
def get_progress():
    """Get current download progress"""
    return jsonify(progress_store)


@app.route('/api/cancel', methods=['POST'])
def cancel_download():
    """Cancel current download"""
    downloader.cancel_download()
    return jsonify({'success': True, 'message': '다운로드가 취소되었습니다.'})


@app.route('/api/set-path', methods=['POST'])
def set_download_path():
    """Set download directory"""
    data = request.get_json()
    path = data.get('path', '')

    if not path:
        return jsonify({'success': False, 'error': '경로를 지정해주세요.'})

    if downloader.set_download_path(path):
        return jsonify({'success': True, 'path': path})
    else:
        return jsonify({'success': False, 'error': '유효하지 않은 경로입니다.'})


@app.route('/api/get-path')
def get_download_path():
    """Get current download directory"""
    return jsonify({'success': True, 'path': downloader.download_path})


@app.route('/api/open-folder', methods=['POST'])
def open_folder():
    """Open download folder or file location"""
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


@app.route('/api/library')
def get_library():
    """Get list of downloaded videos"""
    try:
        folder = request.args.get('folder', None)
        videos = downloader.get_video_library(folder=folder)
        return jsonify({'success': True, 'videos': videos})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'videos': []})


@app.route('/api/tags')
def get_all_tags():
    """Get all unique tags"""
    try:
        tags = downloader.get_all_tags()
        return jsonify({'success': True, 'tags': tags})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'tags': []})


@app.route('/api/tags/<path:video_id>', methods=['POST'])
def update_video_tags(video_id):
    """Update tags for a video"""
    try:
        data = request.get_json()
        tags = data.get('tags', [])

        if downloader.update_tags(video_id, tags):
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': '태그 업데이트 실패'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/video/<path:video_id>')
def stream_video(video_id):
    """Stream video file"""
    try:
        # Find video file
        video_path = None
        for ext in ['.mp4', '.webm', '.mkv']:
            potential_path = os.path.join(downloader.download_path, video_id + ext)
            if os.path.exists(potential_path):
                video_path = potential_path
                break

        if not video_path:
            return jsonify({'error': 'Video not found'}), 404

        # Get file size
        file_size = os.path.getsize(video_path)

        # Handle range requests for video seeking
        range_header = request.headers.get('Range', None)

        if range_header:
            # Parse range header
            byte_start = 0
            byte_end = file_size - 1

            match = range_header.replace('bytes=', '').split('-')
            if match[0]:
                byte_start = int(match[0])
            if match[1]:
                byte_end = int(match[1])

            length = byte_end - byte_start + 1

            def generate():
                with open(video_path, 'rb') as f:
                    f.seek(byte_start)
                    remaining = length
                    chunk_size = 8192
                    while remaining > 0:
                        chunk = f.read(min(chunk_size, remaining))
                        if not chunk:
                            break
                        remaining -= len(chunk)
                        yield chunk

            response = Response(
                generate(),
                status=206,
                mimetype='video/mp4',
                direct_passthrough=True
            )
            response.headers.add('Content-Range', f'bytes {byte_start}-{byte_end}/{file_size}')
            response.headers.add('Accept-Ranges', 'bytes')
            response.headers.add('Content-Length', str(length))
            return response
        else:
            return send_file(video_path, mimetype='video/mp4')

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ===== Settings API =====

@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Get all settings"""
    return jsonify({
        'success': True,
        'settings': config.get_all()
    })


@app.route('/api/settings', methods=['POST'])
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


# ===== Folder Management API =====

@app.route('/api/folders', methods=['GET'])
def get_folders():
    """Get list of all folders"""
    folders = folder_manager.get_folders()
    return jsonify({
        'success': True,
        'folders': folders,
        'configured': folder_manager.is_configured()
    })


@app.route('/api/folders', methods=['POST'])
def create_folder():
    """Create a new folder"""
    data = request.get_json()
    name = data.get('name', '')

    success, message = folder_manager.create_folder(name)
    return jsonify({
        'success': success,
        'message': message if not success else '폴더가 생성되었습니다.',
        'folder_name': message if success else None
    })


@app.route('/api/folders/<path:name>', methods=['PUT'])
def rename_folder(name):
    """Rename a folder"""
    data = request.get_json()
    new_name = data.get('new_name', '')

    success, message = folder_manager.rename_folder(name, new_name)
    return jsonify({
        'success': success,
        'message': message if not success else '폴더 이름이 변경되었습니다.',
        'new_name': message if success else None
    })


@app.route('/api/folders/<path:name>', methods=['DELETE'])
def delete_folder(name):
    """Delete a folder (moves videos to 00_Inbox)"""
    success, message = folder_manager.delete_folder(name)
    return jsonify({
        'success': success,
        'message': message
    })


@app.route('/api/videos/move', methods=['POST'])
def move_video():
    """Move a video to another folder"""
    data = request.get_json()
    filename = data.get('filename', '')
    source_folder = data.get('source_folder', '')
    target_folder = data.get('target_folder', '')

    success, message = folder_manager.move_video(filename, source_folder, target_folder)
    return jsonify({
        'success': success,
        'message': message
    })


@app.route('/api/videos/<path:folder>/<path:video_id>')
def stream_video_from_folder(folder, video_id):
    """Stream video file from specific folder"""
    try:
        video_path = None
        folder_path = folder_manager.get_folder_path(folder)

        if not folder_path:
            return jsonify({'error': 'Folder not configured'}), 404

        for ext in ['.mp4', '.webm', '.mkv', '.mp3']:
            potential_path = os.path.join(folder_path, video_id + ext)
            if os.path.exists(potential_path):
                video_path = potential_path
                break

        if not video_path:
            return jsonify({'error': 'Video not found'}), 404

        file_size = os.path.getsize(video_path)
        range_header = request.headers.get('Range', None)

        if range_header:
            byte_start = 0
            byte_end = file_size - 1

            match = range_header.replace('bytes=', '').split('-')
            if match[0]:
                byte_start = int(match[0])
            if match[1]:
                byte_end = int(match[1])

            length = byte_end - byte_start + 1

            def generate():
                with open(video_path, 'rb') as f:
                    f.seek(byte_start)
                    remaining = length
                    chunk_size = 8192
                    while remaining > 0:
                        chunk = f.read(min(chunk_size, remaining))
                        if not chunk:
                            break
                        remaining -= len(chunk)
                        yield chunk

            mimetype = 'audio/mpeg' if video_path.endswith('.mp3') else 'video/mp4'
            response = Response(
                generate(),
                status=206,
                mimetype=mimetype,
                direct_passthrough=True
            )
            response.headers.add('Content-Range', f'bytes {byte_start}-{byte_end}/{file_size}')
            response.headers.add('Accept-Ranges', 'bytes')
            response.headers.add('Content-Length', str(length))
            return response
        else:
            mimetype = 'audio/mpeg' if video_path.endswith('.mp3') else 'video/mp4'
            return send_file(video_path, mimetype=mimetype)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/open-file-location', methods=['POST'])
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


@app.route('/api/save-link', methods=['POST'])
def save_link_only():
    """Save video link without downloading the actual video"""
    data = request.get_json()
    url = data.get('url', '')
    folder = data.get('folder', config.default_folder)

    if not url:
        return jsonify({'success': False, 'error': 'URL을 입력해주세요.'})

    result = downloader.save_link_only(url, folder)
    return jsonify(result)


@app.route('/api/download-later', methods=['POST'])
def download_later():
    """Download a previously saved link"""
    global progress_store

    data = request.get_json()
    video_id = data.get('video_id', '')
    folder = data.get('folder', config.default_folder)

    if not video_id:
        return jsonify({'success': False, 'error': 'Video ID가 필요합니다.'})

    # Get URL from metadata
    url = downloader.get_url_from_metadata(video_id)
    if not url:
        return jsonify({'success': False, 'error': '원본 URL을 찾을 수 없습니다.'})

    # Reset progress
    progress_store = {
        'status': 'starting',
        'progress': 0,
        'message': '다운로드 시작 중...',
        'filename': '',
        'filepath': ''
    }

    options = {
        'resolution': '720p',
        'folder': folder
    }

    def on_complete(result):
        global progress_store
        if result['success']:
            # Update metadata to mark as downloaded
            downloader.mark_as_downloaded(video_id)
            progress_store.update({
                'status': 'completed',
                'progress': 100,
                'message': '다운로드 완료!',
                'filename': result['filename'],
                'filepath': result['filepath']
            })
        else:
            progress_store.update({
                'status': 'error',
                'message': result.get('error', '다운로드 실패')
            })

    download_async(
        downloader, url, 'video', options,
        progress_callback=update_progress,
        complete_callback=on_complete
    )

    return jsonify({'success': True, 'message': '다운로드가 시작되었습니다.'})


@app.route('/api/update-metadata/<path:video_id>', methods=['POST'])
def update_metadata(video_id):
    """Update video metadata (title, description)"""
    data = request.get_json()

    try:
        success = downloader.update_metadata(video_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/thumbnails/<path:video_id>')
def get_thumbnail(video_id):
    """Serve local thumbnail image"""
    try:
        thumbnail_path = os.path.join(folder_manager.thumbnails_path, video_id + '.jpg')
        if os.path.exists(thumbnail_path):
            return send_file(thumbnail_path, mimetype='image/jpeg')
        else:
            return jsonify({'error': 'Thumbnail not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/open-content-folder', methods=['POST'])
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


# ===== Update API =====

@app.route('/api/version')
def get_version():
    """Get current app version"""
    return jsonify({
        'success': True,
        'version': __version__,
        'app_name': __app_name__
    })


@app.route('/api/check-update')
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


@app.route('/api/download-update', methods=['POST'])
def download_update():
    """Download update installer"""
    global update_progress_store

    data = request.get_json()
    download_url = data.get('download_url', '')
    asset_name = data.get('asset_name', 'ClickClipDown_Setup.exe')

    if not download_url:
        return jsonify({'success': False, 'error': 'Download URL is required'})

    # Reset progress
    update_progress_store = {
        'status': 'downloading',
        'progress': 0,
        'message': 'Starting download...',
        'filepath': ''
    }

    def download_installer():
        global update_progress_store
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
                            update_progress_store.update({
                                'status': 'downloading',
                                'progress': progress,
                                'message': f'Downloading... {downloaded_size // 1024 // 1024}MB / {total_size // 1024 // 1024}MB'
                            })

            update_progress_store.update({
                'status': 'completed',
                'progress': 100,
                'message': 'Download completed',
                'filepath': filepath
            })
        except Exception as e:
            update_progress_store.update({
                'status': 'error',
                'message': str(e)
            })

    # Start download in background
    thread = threading.Thread(target=download_installer)
    thread.daemon = True
    thread.start()

    return jsonify({'success': True, 'message': 'Download started'})


@app.route('/api/update-progress')
def get_update_progress():
    """Get update download progress"""
    return jsonify(update_progress_store)


@app.route('/api/install-update', methods=['POST'])
def install_update():
    """Launch installer and exit app"""
    global update_progress_store

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


@app.route('/api/rename-default-folder', methods=['POST'])
def rename_default_folder():
    """Rename the default folder"""
    data = request.get_json()
    new_name = data.get('new_name', '')

    if not new_name:
        return jsonify({'success': False, 'error': 'New name is required'})

    success, message = folder_manager.rename_default_folder(new_name)
    return jsonify({
        'success': success,
        'message': message
    })


@app.route('/api/delete-video', methods=['POST'])
def delete_video():
    """Delete a video and its metadata"""
    data = request.get_json()
    folder = data.get('folder', '')
    filename = data.get('filename', '')

    folder_path = folder_manager.get_folder_path(folder)
    if not folder_path:
        return jsonify({'success': False, 'error': 'Folder not configured'})

    video_path = os.path.join(folder_path, filename)

    try:
        if os.path.isfile(video_path):
            os.remove(video_path)

            # Also delete metadata file
            base_name = os.path.splitext(filename)[0]
            md_path = os.path.join(folder_manager.metadata_path, base_name + '.md')
            if os.path.isfile(md_path):
                os.remove(md_path)

            return jsonify({'success': True, 'message': '동영상이 삭제되었습니다.'})
        else:
            return jsonify({'success': False, 'error': 'File not found'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


class Api:
    """API for PyWebView JavaScript bridge"""

    def select_folder(self):
        """Open folder selection dialog for download path"""
        result = webview.windows[0].create_file_dialog(
            webview.FOLDER_DIALOG
        )
        if result and len(result) > 0:
            path = result[0]
            downloader.set_download_path(path)
            return path
        return None

    def select_content_folder(self):
        """Open folder selection dialog for content storage path"""
        try:
            result = webview.windows[0].create_file_dialog(
                webview.FOLDER_DIALOG
            )
            if result and len(result) > 0:
                path = result[0]
                # Initialize folder structure
                config.content_path = path
                folder_manager.initialize_structure(path)
                return path
        except Exception as e:
            print(f"Error selecting content folder: {e}")
        return None

    def open_url(self, url):
        """Open URL in default browser"""
        try:
            webbrowser.open(url)
            return True
        except:
            return False


def run_flask():
    """Run Flask in a separate thread"""
    app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False, threaded=True)


def main():
    """Main entry point"""
    # Start Flask server in background
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.daemon = True
    flask_thread.start()

    # Create PyWebView window
    api = Api()

    # Get icon path
    icon_path = os.path.join(os.path.dirname(__file__), 'static', 'img', 'logo.png')

    window = webview.create_window(
        'ClickClipDown',
        'http://127.0.0.1:5000',
        width=1100,
        height=750,
        min_size=(900, 600),
        js_api=api,
        confirm_close=True,
        background_color='#2c2c2e'
    )

    # Start PyWebView (debug=True enables F12 developer tools)
    # Note: icon parameter is passed to webview.start() in PyWebView 6.x
    webview.start(debug=True, icon=icon_path)


if __name__ == '__main__':
    main()
