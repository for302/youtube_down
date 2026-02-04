"""
Download routes for ClickClipDown.
Handles video/audio download operations.
"""
from flask import Blueprint, request, jsonify

from services.downloader import YouTubeDownloader, download_async
from .shared import (
    get_progress_store,
    reset_progress_store,
    update_progress,
    update_progress_store_data
)

download_bp = Blueprint('download', __name__)

# Global downloader instance
downloader = YouTubeDownloader()


@download_bp.route('/api/info', methods=['POST'])
def get_video_info():
    """Get video information from URL"""
    data = request.get_json()
    url = data.get('url', '')

    if not url:
        return jsonify({'success': False, 'error': 'URL을 입력해주세요.'})

    result = downloader.get_video_info(url)
    return jsonify(result)


@download_bp.route('/api/download', methods=['POST'])
def start_download():
    """Start download"""
    data = request.get_json()
    url = data.get('url', '')
    download_type = data.get('type', 'video')  # 'video' or 'audio'
    resolution = data.get('resolution', '720p')
    bitrate = data.get('bitrate', '192')
    folder = data.get('folder', '00_Inbox')  # Target folder

    if not url:
        return jsonify({'success': False, 'error': 'URL을 입력해주세요.'})

    # Reset progress
    reset_progress_store()

    options = {
        'resolution': resolution,
        'bitrate': bitrate,
        'folder': folder
    }

    def on_complete(result):
        if result['success']:
            update_progress_store_data({
                'status': 'completed',
                'progress': 100,
                'message': '다운로드 완료!',
                'filename': result['filename'],
                'filepath': result['filepath']
            })
        else:
            update_progress_store_data({
                'status': 'error',
                'message': result.get('error', '다운로드 실패')
            })

    download_async(
        downloader, url, download_type, options,
        progress_callback=update_progress,
        complete_callback=on_complete
    )

    return jsonify({'success': True, 'message': '다운로드가 시작되었습니다.'})


@download_bp.route('/api/progress')
def get_progress():
    """Get current download progress"""
    return jsonify(get_progress_store())


@download_bp.route('/api/cancel', methods=['POST'])
def cancel_download():
    """Cancel current download"""
    downloader.cancel_download()
    return jsonify({'success': True, 'message': '다운로드가 취소되었습니다.'})


@download_bp.route('/api/set-path', methods=['POST'])
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


@download_bp.route('/api/get-path')
def get_download_path():
    """Get current download directory"""
    return jsonify({'success': True, 'path': downloader.download_path})


def get_downloader() -> YouTubeDownloader:
    """Get the global downloader instance.

    Returns:
        YouTubeDownloader instance
    """
    return downloader
