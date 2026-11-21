"""
Persistence layer (SQLAlchemy + SQLite).

Every row belongs to a `User`. The app currently runs single-user with a local
account (see `services/users.py::current_user`), which is the only function to
replace when real authentication is added.
"""
import json
from datetime import datetime

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event
from sqlalchemy.engine import Engine

db = SQLAlchemy()


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_connection, _record):
    if "sqlite" not in type(dbapi_connection).__module__:
        return  # e.g. psycopg2: a failed PRAGMA would abort the whole transaction
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()
    except Exception:  # not sqlite
        pass


class JSONText(db.TypeDecorator):
    """Stores Python lists/dicts as JSON text."""

    impl = db.Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return json.dumps(value if value is not None else None, ensure_ascii=False)

    def process_result_value(self, value, dialect):
        if value in (None, "", "null"):
            return None
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return None


def _now():
    return datetime.utcnow()


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    handle = db.Column(db.String(80), unique=True, nullable=False)
    supabase_uid = db.Column(db.String(40), unique=True, index=True)  # auth.users.id when signed in
    email = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=_now)


class Book(db.Model):
    """A book in the user's personal library."""

    __tablename__ = "books"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Bibliographic data (imported automatically)
    title = db.Column(db.String(400), nullable=False)
    subtitle = db.Column(db.String(400))
    authors = db.Column(JSONText, default=list)
    description = db.Column(db.Text)
    publisher = db.Column(db.String(255))
    published_date = db.Column(db.String(40))
    year = db.Column(db.Integer)
    page_count = db.Column(db.Integer)
    isbn13 = db.Column(db.String(20), index=True)
    isbn10 = db.Column(db.String(20))
    language = db.Column(db.String(10))
    categories = db.Column(JSONText, default=list)  # raw subjects/categories from the APIs
    genres = db.Column(JSONText, default=list)  # app genre keys (see taxonomy)
    cover_url = db.Column(db.Text)
    cover_alt_url = db.Column(db.Text)
    source = db.Column(db.String(20))  # google | openlibrary | manual
    google_id = db.Column(db.String(40), index=True)
    ol_work_key = db.Column(db.String(40), index=True)
    dedupe_key = db.Column(db.String(300), index=True)

    # Personal data
    status = db.Column(db.String(12), nullable=False, default="want")  # want | reading | read
    rating = db.Column(db.Float)  # 0.5 .. 5
    started_at = db.Column(db.String(10))  # YYYY-MM-DD
    finished_at = db.Column(db.String(10))
    current_page = db.Column(db.Integer)
    notes = db.Column(db.Text)
    review = db.Column(db.Text)

    added_at = db.Column(db.DateTime, default=_now)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now)


class Shelf(db.Model):
    """A custom list ("Mis favoritos", "Para releer"...)."""

    __tablename__ = "shelves"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.String(400))
    color = db.Column(db.String(20))
    emoji = db.Column(db.String(8))
    created_at = db.Column(db.DateTime, default=_now)
    items = db.relationship("ShelfItem", backref="shelf", lazy=True, cascade="all, delete-orphan")


class ShelfItem(db.Model):
    __tablename__ = "shelf_items"
    id = db.Column(db.Integer, primary_key=True)
    shelf_id = db.Column(db.Integer, db.ForeignKey("shelves.id", ondelete="CASCADE"), nullable=False, index=True)
    book_id = db.Column(db.Integer, db.ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    added_at = db.Column(db.DateTime, default=_now)
    __table_args__ = (db.UniqueConstraint("shelf_id", "book_id", name="uq_shelf_book"),)


class ReaderProfile(db.Model):
    """Literary profile built during onboarding and refined over time."""

    __tablename__ = "reader_profiles"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    display_name = db.Column(db.String(80))
    genres = db.Column(JSONText, default=list)  # ["filosofia", ...]
    preferences = db.Column(JSONText, default=dict)  # axes in [-1, 1] + purposes + language
    favorite_authors = db.Column(JSONText, default=list)  # [{name, key, photo}]
    reading_goal = db.Column(db.Integer, default=12)
    theme = db.Column(db.String(10), default="ink")
    onboarded_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now)


class Interaction(db.Model):
    """Signals about catalog books: onboarding swipes, dismissals, likes."""

    __tablename__ = "interactions"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = db.Column(db.String(60), nullable=False)  # catalog id, e.g. "ol:OL45804W"
    kind = db.Column(db.String(12), nullable=False)  # like | love | dislike | dismiss
    title = db.Column(db.String(400))
    authors = db.Column(JSONText, default=list)
    terms = db.Column(JSONText, default=list)  # subjects used by the recommender
    genres = db.Column(JSONText, default=list)
    created_at = db.Column(db.DateTime, default=_now)
    __table_args__ = (db.UniqueConstraint("user_id", "item_id", name="uq_interaction_item"),)


# ─── Writer's Studio ─────────────────────────────────────────────────────────


class StudioCategory(db.Model):
    """A category for the user's own writings (Poesía, Cartas…)."""

    __tablename__ = "studio_categories"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(80), nullable=False)
    color = db.Column(db.String(20))
    position = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=_now)


class StudioImage(db.Model):
    """An image uploaded to the studio's image library (used as covers)."""

    __tablename__ = "studio_images"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = db.Column(db.String(120), nullable=False)
    mime = db.Column(db.String(40), nullable=False)
    width = db.Column(db.Integer)
    height = db.Column(db.Integer)
    size_bytes = db.Column(db.Integer)
    data = db.Column(db.LargeBinary)  # image bytes (hosted); older rows live in uploads/studio
    token = db.Column(db.String(40), unique=True, index=True)  # unguessable media URL for <img>
    created_at = db.Column(db.DateTime, default=_now)


class Writing(db.Model):
    """A text written in the studio. Content is plain text (typewriter style)."""

    __tablename__ = "studio_writings"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = db.Column(db.String(300), default="")
    content = db.Column(db.Text, default="")
    description = db.Column(db.String(600), default="")
    category_id = db.Column(db.Integer, db.ForeignKey("studio_categories.id", ondelete="SET NULL"))
    cover_image_id = db.Column(db.Integer, db.ForeignKey("studio_images.id", ondelete="SET NULL"))
    word_count = db.Column(db.Integer, default=0)
    char_count = db.Column(db.Integer, default=0)
    caret = db.Column(db.Integer, default=0)  # where the writer left off
    scroll = db.Column(db.Float, default=0.0)  # scroll position as a fraction of the page
    position = db.Column(db.Integer, default=0)  # manual ordering in the studio
    version = db.Column(db.Integer, default=1, nullable=False)  # optimistic concurrency
    client_key = db.Column(db.String(64), index=True)  # makes creation idempotent
    inspiration = db.Column(db.Text)  # JSON reference to a poem from the poetry library (optional)
    created_at = db.Column(db.DateTime, default=_now)
    updated_at = db.Column(db.DateTime, default=_now)  # set explicitly (caret moves don't count)
    last_written_at = db.Column(db.DateTime, default=_now)  # last change to the text itself


# Social tables live in their own module; importing it here registers them with the
# same metadata (create_all, tests) wherever `models` is used.
import social_models  # noqa: E402,F401
