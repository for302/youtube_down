"""
Flask Blueprint registration for ClickClipDown routes.
"""
from flask import Flask

from .download import download_bp
from .library import library_bp
from .settings import settings_bp
from .folders import folders_bp
from .streaming import streaming_bp
from .update import update_bp


def register_blueprints(app: Flask) -> None:
    """Register all blueprints with the Flask application.

    Args:
        app: Flask application instance
    """
    app.register_blueprint(download_bp)
    app.register_blueprint(library_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(folders_bp)
    app.register_blueprint(streaming_bp)
    app.register_blueprint(update_bp)


__all__ = [
    'register_blueprints',
    'download_bp',
    'library_bp',
    'settings_bp',
    'folders_bp',
    'streaming_bp',
    'update_bp',
]
