"""
Folder management routes for ClickClipDown.
Handles folder CRUD operations and video management.
"""
import os
from flask import Blueprint, request, jsonify

from folder_manager import folder_manager
from services.metadata import MetadataService
from services.thumbnail import ThumbnailService

folders_bp = Blueprint('folders', __name__)

# Initialize services
_metadata_service = MetadataService()
_thumbnail_service = ThumbnailService()


@folders_bp.route('/api/folders', methods=['GET'])
def get_folders():
    """Get list of all folders"""
    folders = folder_manager.get_folders()
    return jsonify({
        'success': True,
        'folders': folders,
        'configured': folder_manager.is_configured()
    })


@folders_bp.route('/api/folders', methods=['POST'])
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


@folders_bp.route('/api/folders/<path:name>', methods=['PUT'])
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


@folders_bp.route('/api/folders/<path:name>', methods=['DELETE'])
def delete_folder(name):
    """Delete a folder (moves videos to 00_Inbox)"""
    success, message = folder_manager.delete_folder(name)
    return jsonify({
        'success': success,
        'message': message
    })


@folders_bp.route('/api/videos/move', methods=['POST'])
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


@folders_bp.route('/api/rename-default-folder', methods=['POST'])
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


@folders_bp.route('/api/delete-video', methods=['POST'])
def delete_video():
    """Delete a video and all related files (metadata, thumbnail, video, audio)"""
    data = request.get_json()
    video_id = data.get('video_id', '')
    folder = data.get('folder', '')
    filename = data.get('filename', '')

    # If no video_id provided, try to infer from filename (backward compatibility)
    if not video_id and filename:
        video_id = os.path.splitext(filename)[0]

    if not video_id:
        return jsonify({'success': False, 'error': 'video_id or filename is required'})

    try:
        deleted_files = []

        # 1. Get files list from metadata
        files = _metadata_service.get_files(video_id)

        # 2. Delete all associated media files
        for f in files:
            file_folder = f.get('folder', folder)
            file_name = f.get('filename', '')
            if file_name:
                folder_path = folder_manager.get_folder_path(file_folder)
                if folder_path:
                    file_path = os.path.join(folder_path, file_name)
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                        deleted_files.append(file_path)

        # Also try to delete by the provided filename (backward compatibility)
        if filename and folder:
            folder_path = folder_manager.get_folder_path(folder)
            if folder_path:
                video_path = os.path.join(folder_path, filename)
                if os.path.isfile(video_path) and video_path not in deleted_files:
                    os.remove(video_path)
                    deleted_files.append(video_path)

                # Also check for corresponding audio/video file with same base name
                base_name = os.path.splitext(filename)[0]
                for ext in ['.mp4', '.mp3', '.webm', '.mkv']:
                    alt_path = os.path.join(folder_path, base_name + ext)
                    if os.path.isfile(alt_path) and alt_path not in deleted_files:
                        os.remove(alt_path)
                        deleted_files.append(alt_path)

        # 3. Delete thumbnail
        _thumbnail_service.delete_thumbnail(video_id)

        # 4. Delete metadata
        _metadata_service.delete_metadata(video_id)

        return jsonify({
            'success': True,
            'message': '항목이 삭제되었습니다.',
            'deleted_files': len(deleted_files)
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
