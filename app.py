"""
YouTube Downloader Desktop Application
Flask + PyWebView based desktop app
"""
import os
import sys
import threading
import webbrowser

from flask import Flask, render_template
import webview

from config import config
from folder_manager import folder_manager
from routes import register_blueprints


def get_window_handle(window):
    """Get the native window handle (HWND) for a pywebview window"""
    hwnd = None

    # Try different methods to get hwnd
    if hasattr(window, '_impl') and hasattr(window._impl, 'hwnd'):
        hwnd = window._impl.hwnd
    elif hasattr(window, 'uid'):
        try:
            import webview.platforms.winforms as winforms
            if hasattr(winforms, 'BrowserView') and window.uid in winforms.BrowserView.instances:
                hwnd = winforms.BrowserView.instances[window.uid].Handle.ToInt32()
        except:
            pass

    return hwnd


def set_window_icon(hwnd, icon_path):
    """Set window icon using Windows API"""
    if not hwnd or not icon_path or not os.path.exists(icon_path):
        return

    try:
        import ctypes
        from ctypes import wintypes

        # Load icon from file
        IMAGE_ICON = 1
        LR_LOADFROMFILE = 0x0010
        LR_DEFAULTSIZE = 0x0040

        # Load small icon (16x16) for title bar
        small_icon = ctypes.windll.user32.LoadImageW(
            None,
            icon_path,
            IMAGE_ICON,
            16, 16,
            LR_LOADFROMFILE
        )

        # Load large icon (32x32) for alt-tab
        large_icon = ctypes.windll.user32.LoadImageW(
            None,
            icon_path,
            IMAGE_ICON,
            32, 32,
            LR_LOADFROMFILE
        )

        # Set the icons
        WM_SETICON = 0x0080
        ICON_SMALL = 0
        ICON_BIG = 1

        if small_icon:
            ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, small_icon)
        if large_icon:
            ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, large_icon)

        print(f"Window icon set successfully")

    except Exception as e:
        print(f"Could not set window icon: {e}")


def set_dark_title_bar(window):
    """Set dark title bar on Windows 10/11"""
    if sys.platform != 'win32':
        return

    try:
        import ctypes

        hwnd = get_window_handle(window)
        if not hwnd:
            print("Could not get window handle")
            return

        # DWMWA_USE_IMMERSIVE_DARK_MODE = 20 (Windows 10 build 18985+)
        # DWMWA_USE_IMMERSIVE_DARK_MODE = 19 (older Windows 10)
        DWMWA_USE_IMMERSIVE_DARK_MODE = 20
        dwmapi = ctypes.windll.dwmapi

        # Try with attribute 20 first (newer Windows)
        value = ctypes.c_int(1)
        result = dwmapi.DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            ctypes.byref(value),
            ctypes.sizeof(value)
        )

        # If failed, try with attribute 19 (older Windows 10)
        if result != 0:
            DWMWA_USE_IMMERSIVE_DARK_MODE = 19
            dwmapi.DwmSetWindowAttribute(
                hwnd,
                DWMWA_USE_IMMERSIVE_DARK_MODE,
                ctypes.byref(value),
                ctypes.sizeof(value)
            )

        # Also set the window icon
        base_dir = os.path.dirname(os.path.abspath(__file__))
        icon_path = os.path.join(base_dir, 'static', 'img', 'icon.ico')
        set_window_icon(hwnd, icon_path)

    except Exception as e:
        print(f"Could not set dark title bar: {e}")


# Flask app setup
app = Flask(__name__)
app.secret_key = 'youtube_downloader_secret_key'

# Register all API blueprints
register_blueprints(app)


@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')


class Api:
    """API for PyWebView JavaScript bridge"""

    def select_folder(self):
        """Open folder selection dialog for download path"""
        from routes.download import get_downloader
        result = webview.windows[0].create_file_dialog(
            webview.FOLDER_DIALOG
        )
        if result and len(result) > 0:
            path = result[0]
            get_downloader().set_download_path(path)
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

    # Get icon path (use .ico for Windows) - must be absolute path
    base_dir = os.path.dirname(os.path.abspath(__file__))
    icon_path = os.path.join(base_dir, 'static', 'img', 'icon.ico')

    # Verify icon exists
    if not os.path.exists(icon_path):
        print(f"Warning: Icon not found at {icon_path}")
        icon_path = None
    else:
        print(f"Using icon: {icon_path}")

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

    # Function to apply dark title bar after window is shown
    def on_shown():
        set_dark_title_bar(window)

    window.events.shown += on_shown

    # Start PyWebView (debug=True enables F12 developer tools)
    webview.start(debug=True, icon=icon_path)


if __name__ == '__main__':
    main()
