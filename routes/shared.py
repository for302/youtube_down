"""
Shared state and utilities for route modules.
"""

# Store for download progress updates
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


def update_progress(data: dict) -> None:
    """Update progress store with download status.

    Args:
        data: Dictionary containing progress data to update
    """
    global progress_store
    progress_store.update(data)


def reset_progress_store() -> dict:
    """Reset progress store to initial state and return it.

    Returns:
        The reset progress store dictionary
    """
    global progress_store
    progress_store = {
        'status': 'starting',
        'progress': 0,
        'message': '다운로드 시작 중...',
        'filename': '',
        'filepath': ''
    }
    return progress_store


def get_progress_store() -> dict:
    """Get current progress store.

    Returns:
        Current progress store dictionary
    """
    return progress_store


def update_progress_store_data(data: dict) -> None:
    """Update progress store with new data.

    Args:
        data: Dictionary containing progress data to update
    """
    global progress_store
    progress_store.update(data)


def reset_update_progress_store() -> dict:
    """Reset update progress store to initial state and return it.

    Returns:
        The reset update progress store dictionary
    """
    global update_progress_store
    update_progress_store = {
        'status': 'downloading',
        'progress': 0,
        'message': 'Starting download...',
        'filepath': ''
    }
    return update_progress_store


def get_update_progress_store() -> dict:
    """Get current update progress store.

    Returns:
        Current update progress store dictionary
    """
    return update_progress_store


def update_update_progress_store_data(data: dict) -> None:
    """Update update progress store with new data.

    Args:
        data: Dictionary containing progress data to update
    """
    global update_progress_store
    update_progress_store.update(data)
