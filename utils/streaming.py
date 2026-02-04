"""
Video streaming utilities with HTTP range request support
"""
import os
from typing import Optional, Tuple, Generator, Dict, Any


def parse_range_header(range_header: str, file_size: int) -> Tuple[int, int, int]:
    """Parse HTTP Range header and return byte range

    Args:
        range_header: The Range header value (e.g., "bytes=0-1024")
        file_size: Total file size in bytes

    Returns:
        Tuple of (byte_start, byte_end, length)
    """
    byte_start = 0
    byte_end = file_size - 1

    # Parse range header: "bytes=start-end"
    range_spec = range_header.replace('bytes=', '').split('-')
    if range_spec[0]:
        byte_start = int(range_spec[0])
    if len(range_spec) > 1 and range_spec[1]:
        byte_end = int(range_spec[1])

    length = byte_end - byte_start + 1
    return byte_start, byte_end, length


def generate_file_chunks(
    filepath: str,
    byte_start: int,
    length: int,
    chunk_size: int = 8192
) -> Generator[bytes, None, None]:
    """Generate file chunks for streaming

    Args:
        filepath: Path to the file to stream
        byte_start: Starting byte position
        length: Number of bytes to read
        chunk_size: Size of each chunk (default: 8192)

    Yields:
        File chunks as bytes
    """
    with open(filepath, 'rb') as f:
        f.seek(byte_start)
        remaining = length
        while remaining > 0:
            chunk = f.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def get_mimetype_for_file(filepath: str) -> str:
    """Get MIME type for a media file

    Args:
        filepath: Path to the file

    Returns:
        MIME type string
    """
    ext = os.path.splitext(filepath)[1].lower()
    mimetypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mkv': 'video/x-matroska',
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
    }
    return mimetypes.get(ext, 'application/octet-stream')


def stream_video_with_range(
    filepath: str,
    range_header: Optional[str] = None,
    chunk_size: int = 8192
) -> Dict[str, Any]:
    """Prepare video streaming response with range support

    This function prepares the data needed for HTTP range request responses,
    but does not create Flask Response objects directly to avoid coupling.

    Args:
        filepath: Path to the video file
        range_header: HTTP Range header value (optional)
        chunk_size: Size of streaming chunks (default: 8192)

    Returns:
        Dictionary containing:
        - 'exists': bool - whether file exists
        - 'file_size': int - total file size
        - 'mimetype': str - MIME type for the file
        - 'is_range_request': bool - whether this is a range request
        - 'byte_start': int - starting byte (for range requests)
        - 'byte_end': int - ending byte (for range requests)
        - 'length': int - content length
        - 'generator': Generator - chunk generator (for range requests)

    Example usage in Flask:
        result = stream_video_with_range(video_path, request.headers.get('Range'))
        if not result['exists']:
            return jsonify({'error': 'Video not found'}), 404

        if result['is_range_request']:
            response = Response(
                result['generator'],
                status=206,
                mimetype=result['mimetype'],
                direct_passthrough=True
            )
            response.headers.add('Content-Range',
                f"bytes {result['byte_start']}-{result['byte_end']}/{result['file_size']}")
            response.headers.add('Accept-Ranges', 'bytes')
            response.headers.add('Content-Length', str(result['length']))
            return response
        else:
            return send_file(video_path, mimetype=result['mimetype'])
    """
    # Check if file exists
    if not os.path.isfile(filepath):
        return {
            'exists': False,
            'file_size': 0,
            'mimetype': '',
            'is_range_request': False,
            'byte_start': 0,
            'byte_end': 0,
            'length': 0,
            'generator': None
        }

    file_size = os.path.getsize(filepath)
    mimetype = get_mimetype_for_file(filepath)

    if range_header:
        byte_start, byte_end, length = parse_range_header(range_header, file_size)
        generator = generate_file_chunks(filepath, byte_start, length, chunk_size)

        return {
            'exists': True,
            'file_size': file_size,
            'mimetype': mimetype,
            'is_range_request': True,
            'byte_start': byte_start,
            'byte_end': byte_end,
            'length': length,
            'generator': generator
        }
    else:
        return {
            'exists': True,
            'file_size': file_size,
            'mimetype': mimetype,
            'is_range_request': False,
            'byte_start': 0,
            'byte_end': file_size - 1,
            'length': file_size,
            'generator': None
        }
