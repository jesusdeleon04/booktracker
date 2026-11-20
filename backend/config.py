"""
Runtime configuration for the Booktracker API.

Values come from environment variables, optionally loaded from `backend/.env`
(see `.env.example`). Nothing secret is ever sent to the frontend: the Google
Books key, if present, is only used server-side.
"""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_dotenv(path):
    """Tiny .env loader (KEY=VALUE per line) so we don't need python-dotenv."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


_load_dotenv(os.path.join(BASE_DIR, ".env"))

DATA_DIR = os.environ.get("BOOKTRACKER_DATA_DIR", os.path.join(BASE_DIR, "data"))
os.makedirs(DATA_DIR, exist_ok=True)

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "sqlite:///" + os.path.join(DATA_DIR, "booktracker.db")
)
# Hosted Postgres (Supabase) URLs often start with postgres://; SQLAlchemy wants a driver.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql+psycopg2://" + DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg2://" + DATABASE_URL[len("postgresql://"):]

# Multi-user mode. Off by default: the app is then a single local user, as before.
# Turn it on with BOOKTRACKER_AUTH=supabase plus the project's URL and PUBLISHABLE key
# (both are public values; the server only uses them to validate login tokens).
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
AUTH_REQUIRED = os.environ.get("BOOKTRACKER_AUTH", "").strip().lower() == "supabase"
if AUTH_REQUIRED and not (SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY):
    raise RuntimeError("BOOKTRACKER_AUTH=supabase necesita SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY.")
if SUPABASE_PUBLISHABLE_KEY.startswith("sb_secret_") or "service_role" in SUPABASE_PUBLISHABLE_KEY:
    raise RuntimeError("SUPABASE_PUBLISHABLE_KEY debe ser la clave publicable, nunca una clave secreta.")
CACHE_DB_PATH = os.path.join(DATA_DIR, "api_cache.db")

# Optional. Google Books' anonymous quota is shared worldwide and is usually
# exhausted, so without a key the app relies on Open Library automatically.
GOOGLE_BOOKS_API_KEY = os.environ.get("GOOGLE_BOOKS_API_KEY", "").strip()

# Optional contact appended to the User-Agent sent to Open Library. Identified
# clients get a higher rate limit. Leave empty to stay anonymous.
CONTACT = os.environ.get("BOOKTRACKER_CONTACT", "").strip()
USER_AGENT = "Booktracker/1.0 (personal reading tracker{})".format(
    "; " + CONTACT if CONTACT else ""
)

FRONTEND_DIST = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend", "dist"))
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "5000"))
DEBUG = os.environ.get("FLASK_DEBUG", "0") == "1"
