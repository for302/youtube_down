"""
Library routes for ClickClipDown.
Handles video library, tags, metadata operations.
"""
import os
import urllib.request
from io import BytesIO
from flask import Blueprint, request, jsonify, send_file, Response

from config import config
from folder_manager import folder_manager
from services.downloader import download_async
from .download import get_downloader
from .shared import (
    reset_progress_store,
    update_progress,
    update_progress_store_data
)

library_bp = Blueprint('library', __name__)


@library_bp.route('/api/library')
def get_library():
    """Get list of downloaded videos"""
    try:
        downloader = get_downloader()
        folder = request.args.get('folder', None)
        videos = downloader.get_video_library(folder=folder)
        return jsonify({'success': True, 'videos': videos})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'videos': []})


@library_bp.route('/api/tags')
def get_all_tags():
    """Get all unique tags"""
    try:
        downloader = get_downloader()
        tags = downloader.get_all_tags()
        return jsonify({'success': True, 'tags': tags})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'tags': []})


@library_bp.route('/api/tags/<path:video_id>', methods=['POST'])
def update_video_tags(video_id):
    """Update tags for a video"""
    try:
        downloader = get_downloader()
        data = request.get_json()
        tags = data.get('tags', [])

        if downloader.update_tags(video_id, tags):
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': '태그 업데이트 실패'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@library_bp.route('/api/thumbnails/<path:video_id>')
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


@library_bp.route('/api/save-link', methods=['POST'])
def save_link_only():
    """Save video link without downloading the actual video"""
    downloader = get_downloader()
    data = request.get_json()
    url = data.get('url', '')
    folder = data.get('folder', config.default_folder)

    if not url:
        return jsonify({'success': False, 'error': 'URL을 입력해주세요.'})

    result = downloader.save_link_only(url, folder)
    return jsonify(result)


@library_bp.route('/api/download-later', methods=['POST'])
def download_later():
    """Download a previously saved link"""
    downloader = get_downloader()
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
    reset_progress_store()

    options = {
        'resolution': '720p',
        'folder': folder
    }

    def on_complete(result):
        if result['success']:
            # Update metadata to mark as downloaded
            downloader.mark_as_downloaded(video_id)
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
        downloader, url, 'video', options,
        progress_callback=update_progress,
        complete_callback=on_complete
    )

    return jsonify({'success': True, 'message': '다운로드가 시작되었습니다.'})


@library_bp.route('/api/update-metadata/<path:video_id>', methods=['POST'])
def update_metadata(video_id):
    """Update video metadata (title, description)"""
    downloader = get_downloader()
    data = request.get_json()

    try:
        success = downloader.update_metadata(video_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@library_bp.route('/api/proxy-thumbnail')
def proxy_thumbnail():
    """Proxy external thumbnail images to avoid CORS issues"""
    url = request.args.get('url', '')

    if not url:
        return jsonify({'error': 'URL required'}), 400

    try:
        # Determine referer based on URL
        referer = 'https://www.google.com/'
        if 'instagram.com' in url or 'cdninstagram.com' in url:
            referer = 'https://www.instagram.com/'
        elif 'tiktok.com' in url:
            referer = 'https://www.tiktok.com/'
        elif 'twitter.com' in url or 'twimg.com' in url:
            referer = 'https://twitter.com/'
        elif 'facebook.com' in url or 'fbcdn.net' in url:
            referer = 'https://www.facebook.com/'

        # Fetch image from external URL
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': referer,
            }
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            image_data = response.read()
            content_type = response.headers.get('Content-Type', 'image/jpeg')

            return Response(
                image_data,
                mimetype=content_type,
                headers={
                    'Cache-Control': 'public, max-age=86400'  # Cache for 1 day
                }
            )
    except Exception as e:
        # Return a placeholder or error
        return jsonify({'error': str(e)}), 500
