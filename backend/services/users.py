"""
User resolution.

Booktracker currently runs as a single local user. Every query in the API is
scoped through `current_user()`, so adding real authentication later (sessions,
JWT, OAuth…) only requires changing this function.
"""
from flask import abort, g, request
from sqlalchemy.exc import IntegrityError

import config
from models import ReaderProfile, Shelf, User, db
from services import auth

DEFAULT_SHELVES = [
    {"name": "Mis favoritos", "description": "Los que recomendaría sin pensarlo.", "color": "#E0643A", "emoji": "♥"},
    {"name": "Para releer", "description": "Merecen una segunda visita.", "color": "#C9A45C", "emoji": "↺"},
    {"name": "Me cambiaron la vida", "description": "Hay un antes y un después.", "color": "#8FA58A", "emoji": "✦"},
]


def _new_user(**fields):
    user = User(**fields)
    db.session.add(user)
    db.session.flush()
    db.session.add(ReaderProfile(user_id=user.id, genres=[], preferences={}, favorite_authors=[]))
    for spec in DEFAULT_SHELVES:
        db.session.add(Shelf(user_id=user.id, **spec))
    db.session.commit()
    return user


def bearer_token():
    header = request.headers.get("Authorization", "")
    return header[7:].strip() if header.lower().startswith("bearer ") else None


def current_user():
    """The signed-in user (multi-user mode) or the single local user."""
    user = getattr(g, "_bt_user", None)
    if user is not None:
        return user
    if not config.AUTH_REQUIRED:
        user = User.query.filter_by(handle="local").first() or _new_user(handle="local")
    else:
        try:
            info = auth.verify(bearer_token())
        except auth.AuthUnavailable:
            abort(503, description="No se pudo comprobar tu sesión con Supabase. Inténtalo de nuevo.")
        if not info:
            abort(401, description="Inicia sesión para continuar.")
        user = User.query.filter_by(supabase_uid=info["uid"]).first()
        if user is None:
            try:
                user = _new_user(handle=f"u-{info['uid']}", supabase_uid=info["uid"], email=info.get("email"))
            except IntegrityError:  # two first requests at once
                db.session.rollback()
                user = User.query.filter_by(supabase_uid=info["uid"]).first()
        elif info.get("email") and user.email != info["email"]:
            user.email = info["email"]
            db.session.commit()
    g._bt_user = user
    return user


def current_profile():
    user = current_user()
    profile = ReaderProfile.query.filter_by(user_id=user.id).first()
    if profile is None:
        profile = ReaderProfile(user_id=user.id, genres=[], preferences={}, favorite_authors=[])
        db.session.add(profile)
        db.session.commit()
    return profile
