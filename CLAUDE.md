# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClickClipDown is a desktop application that downloads videos and audio from YouTube. It uses a Python Flask backend with a web-based frontend (HTML/CSS/JavaScript) wrapped in PyWebView for cross-platform desktop support.

## Development Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run the application (development)
python app.py

# Build standalone executable
pyinstaller build/youtube_downloader.spec

# Create Windows installer (requires Inno Setup)
# Compile build/installer.iss with Inno Setup
```

## Architecture

**Three-tier structure:**
- **Backend (Flask)**: `app.py` serves RESTful API endpoints and handles PyWebView integration
- **Frontend (Web)**: Single-page app in `templates/index.html` with Bootstrap 5.3
- **Desktop Shell (PyWebView)**: Wraps the web UI in a native window

**Core modules:**
- `app.py` - Flask routes, API endpoints, video streaming with HTTP range support
- `downloader.py` - `YouTubeDownloader` class wrapping yt-dlp for video/audio downloads with progress callbacks
- `config.py` - `ConfigManager` singleton storing settings in platform-specific JSON files
- `folder_manager.py` - `FolderManager` for organizing downloads into folders

**Data flow:**
```
User Input → JavaScript → Flask API → YouTubeDownloader/FolderManager → yt-dlp + FFmpeg → Local filesystem
```

**Directory structure for downloads:**
```
content_path/
├── videos/
│   ├── 00_Inbox/  (default folder)
│   └── [user folders]/
└── metadata/
    └── [video_id].md  (markdown metadata files)
```

## Key API Endpoints

- `POST /api/download` - Start video/audio download
- `POST /api/info` - Fetch video metadata without downloading
- `GET /api/progress` - Poll download progress
- `GET /api/library` - List downloaded videos
- `GET/POST/PUT/DELETE /api/folders` - Folder management
- `GET/POST /api/settings` - App settings
- `GET /api/videos/<folder>/<video_id>` - Stream video with range request support

## Technology Stack

- Python 3, Flask 2.3+, PyWebView 4.4+
- yt-dlp for YouTube downloads, FFmpeg for audio extraction
- Bootstrap 5.3, vanilla JavaScript frontend
- PyInstaller for building, Inno Setup for Windows installer

## Configuration Paths

Settings stored in platform-specific locations:
- Windows: `%APPDATA%/YouTubeDownloader/settings.json`
- macOS: `~/Library/Application Support/YouTubeDownloader`
- Linux: `~/.config/YouTubeDownloader`
