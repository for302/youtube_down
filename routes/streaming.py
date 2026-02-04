"""
Streaming routes for ClickClipDown.
Handles video streaming with range request support.
"""
import os
from flask import Blueprint, request, jsonify, send_file, Response

from folder_manager import folder_manager
from .download import get_downloader

streaming_bp = Blueprint('streaming', __name__)


def stream_file_with_range(file_path: str, range_header: str, file_size: int) -> Response:
    """Stream file with HTTP range request support.

    Args:
        file_path: Path to the file to stream
        range_header: HTTP Range header value
        file_size: Total file size in bytes

    Returns:
        Flask Response object with proper range headers
    """
    byte_start = 0
    byte_end = file_size - 1

    match = range_header.replace('bytes=', '').split('-')
    if match[0]:
        byte_start = int(match[0])
    if match[1]:
        byte_end = int(match[1])

    length = byte_end - byte_start + 1

    def generate():
        with open(file_path, 'rb') as f:
            f.seek(byte_start)
            remaining = length
            chunk_size = 8192
            while remaining > 0:
                chunk = f.read(min(chunk_size, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    # Determine mimetype based on file extension
    if file_path.endswith('.mp3'):
        mimetype = 'audio/mpeg'
    elif file_path.endswith('.webm'):
        mimetype = 'video/webm'
    elif file_path.endswith('.mkv'):
        mimetype = 'video/x-matroska'
    else:
        mimetype = 'video/mp4'

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


def get_mimetype(file_path: str) -> str:
    """Get mimetype for a media file.

    Args:
        file_path: Path to the file

    Returns:
        Mimetype string
    """
    if file_path.endswith('.mp3'):
        return 'audio/mpeg'
    elif file_path.endswith('.webm'):
        return 'video/webm'
    elif file_path.endswith('.mkv'):
        return 'video/x-matroska'
    else:
        return 'video/mp4'


@streaming_bp.route('/api/video/<path:video_id>')
def stream_video(video_id):
    """Stream video file"""
    try:
        downloader = get_downloader()
        # Find video file
        video_path = None

        # Check for explicit file type parameter
        file_type = request.args.get('type', None)

        if file_type == 'audio':
            extensions = ['.mp3', '.mp4', '.webm', '.mkv']
        else:
            extensions = ['.mp4', '.webm', '.mkv', '.mp3']

        for ext in extensions:
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
            return stream_file_with_range(video_path, range_header, file_size)
        else:
            return send_file(video_path, mimetype=get_mimetype(video_path))

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@streaming_bp.route('/api/videos/<path:folder>/<path:video_id>')
def stream_video_from_folder(folder, video_id):
    """Stream video file from specific folder"""
    try:
        video_path = None
        folder_path = folder_manager.get_folder_path(folder)

        if not folder_path:
            return jsonify({'error': 'Folder not configured'}), 404

        # Check for explicit file type parameter (for audio vs video with same base name)
        file_type = request.args.get('type', None)

        if file_type == 'audio':
            # Audio requested - check .mp3 first
            extensions = ['.mp3', '.mp4', '.webm', '.mkv']
        else:
            # Video requested or default - check video formats first
            extensions = ['.mp4', '.webm', '.mkv', '.mp3']

        for ext in extensions:
            potential_path = os.path.join(folder_path, video_id + ext)
            if os.path.exists(potential_path):
                video_path = potential_path
                break

        if not video_path:
            return jsonify({'error': 'Video not found'}), 404

        file_size = os.path.getsize(video_path)
        range_header = request.headers.get('Range', None)

        if range_header:
            return stream_file_with_range(video_path, range_header, file_size)
        else:
            return send_file(video_path, mimetype=get_mimetype(video_path))

    except Exception as e:
        return jsonify({'error': str(e)}), 500
