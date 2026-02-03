import sys
from cx_Freeze import setup, Executable
from version import __version__, __app_name__

build_exe_options = {
    "packages": ["flask", "webview", "yt_dlp", "jinja2", "werkzeug"],
    "includes": ["config", "downloader", "folder_manager", "version"],
    "include_files": [
        ("templates", "templates"),
        ("static", "static"),
        ("resources/ffmpeg", "resources/ffmpeg"),
    ],
    "excludes": ["tkinter", "unittest", "pydoc"],
}

bdist_msi_options = {
    "upgrade_code": "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}",
    "add_to_path": False,
    "initial_target_dir": r"[ProgramFilesFolder]\ClickClipDown",
}

base = "gui" if sys.platform == "win32" else None

executables = [
    Executable(
        "app.py",
        base=base,
        target_name="ClickClipDown.exe",
        icon="resources/icon.ico" if sys.platform == "win32" else None,
        shortcut_name="ClickClipDown",
        shortcut_dir="DesktopFolder",
    )
]

setup(
    name=__app_name__,
    version=__version__,
    description="YouTube video and audio downloader",
    author="for302",
    options={
        "build_exe": build_exe_options,
        "bdist_msi": bdist_msi_options,
    },
    executables=executables,
)
