"""
Tertulia: perfiles, amistades, obsequios (libros y poemas) y correspondencia.

Everything social is read and written by the API server only, like the rest of
the library. In Supabase these tables have RLS enabled with no policy and no
grants for anon/authenticated, so the public Data API can't read them; the
server checks friendship and blocks on every query. Rules that must hold
whatever the code does live in the schema: ordered unique friend pairs (no
self-friendship, no duplicate or contradictory requests), one share per
idempotency key, no protected poem text, and — in Postgres — a trigger that
makes a sent letter immutable.
"""
from models import JSONText, _now, db


class SocialProfile(db.Model):
    """Literary card of a user (1:1 with users)."""

    __tablename__ = "social_profiles"
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    username = db.Column(db.String(30), nullable=False, unique=True)  # always lowercase
    bio = db.Column(db.String(400))
    # Google data is kept apart so it never overwrites what the user customised.
    google_name = db.Column(db.String(120))
    google_avatar_url = db.Column(db.Text)
    avatar_mode = db.Column(db.String(10), nullable=False, default="google")  # google | custom | none
    avatar_data = db.Column(db.LargeBinary)
    avatar_mime = db.Column(db.String(40))
    avatar_token = db.Column(db.String(40), unique=True)
    favorite_books = db.Column(JSONText, default=list)  # snapshots chosen from the user's own library
    discoverable = db.Column(db.Boolean, nullable=False, default=True)  # found by name / @usuario
    email_lookup = db.Column(db.Boolean, nullable=False, default=True)  # found by exact e-mail
    show_genres = db.Column(db.String(8), nullable=False, default="friends")  # everyone | friends | nobody
    show_authors = db.Column(db.String(8), nullable=False, default="friends")
    show_books = db.Column(db.String(8), nullable=False, default="friends")
    show_reading = db.Column(db.String(8), nullable=False, default="friends")
    show_writings = db.Column(db.String(8), nullable=False, default="friends")  # friends | nobody (section of published writings)
    created_at = db.Column(db.DateTime, default=_now)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now)


class FriendLink(db.Model):
    """One row per pair of people: a pending request, an accepted friendship or
    a declined request. The pair is stored ordered (low < high), so duplicates
    and contradictory states (A→B and B→A at once) are impossible."""

    __tablename__ = "friend_links"
    id = db.Column(db.Integer, primary_key=True)
    user_low = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    user_high = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = db.Column(db.String(10), nullable=False, default="pending")  # pending | accepted | declined
    created_at = db.Column(db.DateTime, default=_now)
    responded_at = db.Column(db.DateTime)
    __table_args__ = (
        db.UniqueConstraint("user_low", "user_high", name="uq_friend_pair"),
        db.CheckConstraint("user_low < user_high", name="ck_friend_pair_order"),
        db.CheckConstraint("status in ('pending', 'accepted', 'declined')", name="ck_friend_status"),
        db.CheckConstraint("requested_by = user_low or requested_by = user_high", name="ck_friend_requester"),
    )


class UserBlock(db.Model):
    __tablename__ = "user_blocks"
    id = db.Column(db.Integer, primary_key=True)
    blocker_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    blocked_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=_now)
    __table_args__ = (
        db.UniqueConstraint("blocker_id", "blocked_id", name="uq_block_pair"),
        db.CheckConstraint("blocker_id <> blocked_id", name="ck_block_self"),
    )


class SharedBook(db.Model):
    """A book recommended to one friend: a bibliographic snapshot (the sender's
    library row is never touched) plus the sender's note and rating."""

    __tablename__ = "shared_books"
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    client_key = db.Column(db.String(64), nullable=False)
    title = db.Column(db.String(400), nullable=False)
    subtitle = db.Column(db.String(400))
    authors = db.Column(JSONText, default=list)
    description = db.Column(db.Text)
    cover_url = db.Column(db.Text)
    year = db.Column(db.Integer)
    publisher = db.Column(db.String(255))
    page_count = db.Column(db.Integer)
    isbn13 = db.Column(db.String(20))
    language = db.Column(db.String(10))
    categories = db.Column(JSONText, default=list)
    genres = db.Column(JSONText, default=list)
    catalog_id = db.Column(db.String(80))
    ol_work_key = db.Column(db.String(40))
    google_id = db.Column(db.String(40))
    sender_rating = db.Column(db.Float)
    note = db.Column(db.String(1000))
    created_at = db.Column(db.DateTime, default=_now, index=True)
    seen_at = db.Column(db.DateTime)
    saved_book_id = db.Column(db.Integer, db.ForeignKey("books.id", ondelete="SET NULL"), index=True)
    reaction = db.Column(db.String(16))
    reply = db.Column(db.String(500))
    replied_at = db.Column(db.DateTime)
    recipient_hidden_at = db.Column(db.DateTime)
    sender_hidden_at = db.Column(db.DateTime)
    __table_args__ = (
        db.UniqueConstraint("sender_id", "recipient_id", "client_key", name="uq_shared_book_once"),
        db.CheckConstraint("sender_id <> recipient_id", name="ck_shared_book_self"),
    )


class SharedPoem(db.Model):
    """A poem shared with one friend. `text` is stored only when the poem is
    free in every jurisdiction the app knows; otherwise it is a reference."""

    __tablename__ = "shared_poems"
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    client_key = db.Column(db.String(64), nullable=False)
    poem_id = db.Column(db.String(700), nullable=False)
    title = db.Column(db.String(500), nullable=False)
    alt_title = db.Column(db.String(500))
    author_name = db.Column(db.String(200))
    author_qid = db.Column(db.String(20))
    author_birth = db.Column(db.Integer)
    author_death = db.Column(db.Integer)
    translator_name = db.Column(db.String(200))
    language = db.Column(db.String(10))
    collection = db.Column(db.String(500))
    year = db.Column(db.Integer)
    source_name = db.Column(db.String(120))
    source_url = db.Column(db.Text)
    rights_status = db.Column(db.String(16), nullable=False)
    rights_label = db.Column(db.String(120))
    attribution = db.Column(db.Text)
    linecount = db.Column(db.Integer)
    text = db.Column(db.Text)
    note = db.Column(db.String(1000))
    created_at = db.Column(db.DateTime, default=_now, index=True)
    seen_at = db.Column(db.DateTime)
    saved_at = db.Column(db.DateTime)
    reaction = db.Column(db.String(16))
    reply = db.Column(db.String(500))
    replied_at = db.Column(db.DateTime)
    recipient_hidden_at = db.Column(db.DateTime)
    sender_hidden_at = db.Column(db.DateTime)
    __table_args__ = (
        db.UniqueConstraint("sender_id", "recipient_id", "client_key", name="uq_shared_poem_once"),
        db.CheckConstraint("sender_id <> recipient_id", name="ck_shared_poem_self"),
        db.CheckConstraint("text is null or rights_status in ('public_domain', 'open_license')",
                           name="ck_shared_poem_text_free"),
    )


class Letter(db.Model):
    """A sent letter: a frozen copy of a Writer's Studio writing. The draft
    keeps living (privately) in the studio; the letter never changes."""

    __tablename__ = "letters"
    id = db.Column(db.Integer, primary_key=True)
    # If the sender deletes the account the letter stays with its recipients.
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), index=True)
    sender_name = db.Column(db.String(120), nullable=False)
    sender_username = db.Column(db.String(30))
    source_writing_id = db.Column(db.Integer, db.ForeignKey("studio_writings.id", ondelete="SET NULL"), index=True)
    in_reply_to_id = db.Column(db.Integer, db.ForeignKey("letters.id", ondelete="SET NULL"), index=True)
    client_key = db.Column(db.String(64), nullable=False)
    subject = db.Column(db.String(300), nullable=False, default="")
    content = db.Column(db.Text, nullable=False)
    word_count = db.Column(db.Integer, default=0)
    stationery = db.Column(db.String(20), nullable=False, default="marfil")
    seal = db.Column(db.String(20), nullable=False, default="lacre")
    cover_data = db.Column(db.LargeBinary)
    cover_mime = db.Column(db.String(40))
    cover_width = db.Column(db.Integer)
    cover_height = db.Column(db.Integer)
    sent_at = db.Column(db.DateTime, default=_now, index=True)
    sender_hidden_at = db.Column(db.DateTime)
    __table_args__ = (db.UniqueConstraint("sender_id", "client_key", name="uq_letter_once"),)


class LetterRecipient(db.Model):
    """Each recipient's own envelope: read state and their own decision to keep
    or remove the letter from their correspondence."""

    __tablename__ = "letter_recipients"
    id = db.Column(db.Integer, primary_key=True)
    letter_id = db.Column(db.Integer, db.ForeignKey("letters.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_name = db.Column(db.String(120), nullable=False)
    delivered_at = db.Column(db.DateTime, default=_now, index=True)
    read_at = db.Column(db.DateTime)
    hidden_at = db.Column(db.DateTime)
    __table_args__ = (db.UniqueConstraint("letter_id", "recipient_id", name="uq_letter_recipient"),)


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # friend_request | friend_accept | book | poem | letter | reply
    kind = db.Column(db.String(24), nullable=False)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), index=True)
    ref_id = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=_now, index=True)
    read_at = db.Column(db.DateTime)


class SocialLookup(db.Model):
    """One row per e-mail lookup, only to rate-limit them (the e-mail isn't stored)."""

    __tablename__ = "social_lookups"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=_now, index=True)


class Publication(db.Model):
    """A writing from the Writer's Studio published in the Tertulia.

    Like a sent letter it is a frozen copy: title, text, category and cover are
    copied when the author publishes, and only change when the author asks to
    update the publication (`update_from_writing`) — editing the original in the
    studio never touches what friends are reading. Audience: "private" (only the
    author) or "friends" (accepted friends, checked on every request). Deleting
    the original writing keeps the publication (source_writing_id becomes NULL).
    """

    __tablename__ = "publications"
    id = db.Column(db.Integer, primary_key=True)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    source_writing_id = db.Column(db.Integer, db.ForeignKey("studio_writings.id", ondelete="SET NULL"), index=True)
    client_key = db.Column(db.String(64), nullable=False)
    title = db.Column(db.String(300), nullable=False)
    intro = db.Column(db.String(600))
    content = db.Column(db.Text, nullable=False)
    word_count = db.Column(db.Integer, default=0)
    category_name = db.Column(db.String(80))
    category_color = db.Column(db.String(20))
    cover_data = db.Column(db.LargeBinary)
    cover_mime = db.Column(db.String(40))
    cover_width = db.Column(db.Integer)
    cover_height = db.Column(db.Integer)
    audience = db.Column(db.String(8), nullable=False, default="friends")  # private | friends
    published_at = db.Column(db.DateTime, default=_now, index=True)  # first time it reached friends
    updated_at = db.Column(db.DateTime)  # last time the author refreshed it from the writing
    withdrawn_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=_now)
    __table_args__ = (
        db.UniqueConstraint("author_id", "client_key", name="uq_publication_once"),
        db.CheckConstraint("audience in ('private', 'friends')", name="ck_publication_audience"),
    )


class PublicationReaction(db.Model):
    """One discreet reaction per reader. Only the author sees who reacted."""

    __tablename__ = "publication_reactions"
    id = db.Column(db.Integer, primary_key=True)
    publication_id = db.Column(db.Integer, db.ForeignKey("publications.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reaction = db.Column(db.String(16), nullable=False)
    created_at = db.Column(db.DateTime, default=_now)
    __table_args__ = (db.UniqueConstraint("publication_id", "user_id", name="uq_publication_reaction"),)


class PublicationComment(db.Model):
    """A reply to the author. Each reader has a private thread with the author:
    `thread_user_id` is the reader, `author_id` whoever wrote this message."""

    __tablename__ = "publication_comments"
    id = db.Column(db.Integer, primary_key=True)
    publication_id = db.Column(db.Integer, db.ForeignKey("publications.id", ondelete="CASCADE"), nullable=False, index=True)
    thread_user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    body = db.Column(db.String(1000), nullable=False)
    created_at = db.Column(db.DateTime, default=_now, index=True)
