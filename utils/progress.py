"""
Thread-safe progress tracking for downloads
"""
import threading
from typing import Dict, Any, Optional


class ProgressStore:
    """Thread-safe store for download progress tracking

    Provides safe access to progress data from multiple threads,
    useful when downloads run in background threads while the main
    thread serves API requests.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._data: Dict[str, Any] = {
            'status': 'idle',
            'progress': 0,
            'message': '',
            'filename': '',
            'filepath': ''
        }

    def update(self, data: Dict[str, Any]) -> None:
        """Update progress data thread-safely

        Args:
            data: Dictionary of progress data to merge
        """
        with self._lock:
            self._data.update(data)

    def get(self, key: str, default: Any = None) -> Any:
        """Get a single value from progress data

        Args:
            key: The key to retrieve
            default: Default value if key doesn't exist

        Returns:
            The value for the key or default
        """
        with self._lock:
            return self._data.get(key, default)

    def get_all(self) -> Dict[str, Any]:
        """Get a copy of all progress data

        Returns:
            Copy of the current progress state
        """
        with self._lock:
            return self._data.copy()

    def reset(self, initial_status: str = 'idle', initial_message: str = '') -> None:
        """Reset progress to initial state

        Args:
            initial_status: Status to set (default: 'idle')
            initial_message: Message to set (default: empty)
        """
        with self._lock:
            self._data = {
                'status': initial_status,
                'progress': 0,
                'message': initial_message,
                'filename': '',
                'filepath': ''
            }

    def set_starting(self, message: str = 'Starting download...') -> None:
        """Set progress to starting state

        Args:
            message: Starting message to display
        """
        self.reset(initial_status='starting', initial_message=message)

    def set_completed(self, filename: str, filepath: str, message: str = 'Download complete!') -> None:
        """Set progress to completed state

        Args:
            filename: Name of the downloaded file
            filepath: Full path to the downloaded file
            message: Completion message
        """
        with self._lock:
            self._data = {
                'status': 'completed',
                'progress': 100,
                'message': message,
                'filename': filename,
                'filepath': filepath
            }

    def set_error(self, error_message: str) -> None:
        """Set progress to error state

        Args:
            error_message: Error message to display
        """
        with self._lock:
            self._data.update({
                'status': 'error',
                'message': error_message
            })

    @property
    def status(self) -> str:
        """Get current status"""
        return self.get('status', 'idle')

    @property
    def progress(self) -> int:
        """Get current progress percentage"""
        return self.get('progress', 0)

    @property
    def is_idle(self) -> bool:
        """Check if download is idle"""
        return self.status == 'idle'

    @property
    def is_downloading(self) -> bool:
        """Check if download is in progress"""
        return self.status in ('starting', 'downloading', 'processing')

    @property
    def is_completed(self) -> bool:
        """Check if download is completed"""
        return self.status == 'completed'

    @property
    def is_error(self) -> bool:
        """Check if download has error"""
        return self.status == 'error'
