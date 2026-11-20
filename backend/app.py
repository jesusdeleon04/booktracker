"""
Booktracker API.

Run:  python backend/app.py      (http://127.0.0.1:5000)

In development the Vite dev server (port 5173) proxies /api here. When the
frontend has been built (`frontend/dist`), this server also serves the app, so
a single process is enough.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, jsonify, send_from_directory  # noqa: E402
from werkzeug.exceptions import HTTPException  # noqa: E402

import config  # noqa: E402
from models import db  # noqa: E402
from routes import discover, library, poetry, profile, studio  # noqa: E402


def _add_missing_columns():
    """Additive, idempotent schema upgrades for existing SQLite files."""
    from sqlalchemy import inspect, text

    upgrades = {
        "studio_writings": {"client_key": "VARCHAR(64)", "inspiration": "TEXT"},
        "users": {"supabase_uid": "VARCHAR(40)", "email": "VARCHAR(255)"},
        "studio_images": {"data": "BLOB", "token": "VARCHAR(40)"},
    }
    insp = inspect(db.engine)
    with db.engine.begin() as conn:
        for table, cols in upgrades.items():
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in cols.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def create_app(database_url=None):
    app = Flask(__name__, static_folder=None)
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url or config.DATABASE_URL
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JSON_AS_ASCII"] = False
    app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # cover uploads and backups
    app.json.ensure_ascii = False
    db.init_app(app)

    app.register_blueprint(library.bp)
    app.register_blueprint(profile.bp)
    app.register_blueprint(discover.bp)
    app.register_blueprint(studio.bp)
    app.register_blueprint(poetry.bp)

    with app.app_context():
        db.create_all()
        _add_missing_columns()

    @app.get("/api/config")
    def _public_config():
        return jsonify({"ok": True, "data": {
            "authRequired": config.AUTH_REQUIRED,
            "supabaseUrl": config.SUPABASE_URL or None,
        }})

    @app.before_request
    def _require_login():
        """In multi-user mode every data route needs a valid session; only the
        public poetry catalog, the health check, the config and unguessable media
        URLs stay open."""
        from flask import request

        if not config.AUTH_REQUIRED or request.method == "OPTIONS":
            return None
        path = request.path
        if not path.startswith("/api/"):
            return None
        if path in ("/api/health", "/api/config") or path.startswith(("/api/poetry/", "/api/studio/media/")):
            return None
        from services.users import current_user

        current_user()  # aborts with 401/503
        return None

    @app.errorhandler(Exception)
    def _error(exc):
        if isinstance(exc, HTTPException):
            if exc.code == 404 and not _is_api():
                return _spa("index.html")
            return jsonify({"ok": False, "error": exc.description}), exc.code
        app.logger.exception(exc)
        db.session.rollback()
        return jsonify({"ok": False, "error": "Error interno del servidor."}), 500

    def _is_api():
        from flask import request

        return request.path.startswith("/api/")

    def _spa(path):
        if not os.path.isdir(config.FRONTEND_DIST):
            return (
                "<h1>Booktracker API</h1><p>El frontend no está compilado. En desarrollo abre "
                "<a href='http://localhost:5173'>http://localhost:5173</a> o ejecuta <code>npm run build</code>.</p>",
                200,
            )
        full = os.path.join(config.FRONTEND_DIST, path)
        if path and os.path.isfile(full):
            return send_from_directory(config.FRONTEND_DIST, path)
        return send_from_directory(config.FRONTEND_DIST, "index.html")

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path=""):
        if path.startswith("api/"):
            return jsonify({"ok": False, "error": "Ruta no encontrada."}), 404
        return _spa(path)

    return app


app = create_app()

if __name__ == "__main__":
    print(f" * Booktracker API en http://{config.HOST}:{config.PORT}")
    if not config.GOOGLE_BOOKS_API_KEY:
        print(" * Sin GOOGLE_BOOKS_API_KEY: se usará Open Library como fuente principal.")
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG, threaded=True)
