"""Shared helpers for the route modules."""
from datetime import date

from flask import jsonify

from models import Book, Interaction, ShelfItem, Shelf
from services.serializers import book_to_dict, profile_to_dict
from services.taste import build_taste
from services.users import current_profile, current_user


def ok(data=None, status=200):
    return jsonify({"ok": True, "data": data}), status


def fail(message, status=400, **extra):
    payload = {"ok": False, "error": message}
    payload.update(extra)
    return jsonify(payload), status


def today():
    return date.today().isoformat()


def shelf_map(user_id):
    rows = (
        ShelfItem.query.join(Shelf, Shelf.id == ShelfItem.shelf_id)
        .filter(Shelf.user_id == user_id)
        .with_entities(ShelfItem.book_id, ShelfItem.shelf_id)
        .all()
    )
    out = {}
    for book_id, shelf_id in rows:
        out.setdefault(book_id, []).append(shelf_id)
    return out


def library_dicts(user_id):
    smap = shelf_map(user_id)
    books = Book.query.filter_by(user_id=user_id).order_by(Book.added_at.desc()).all()
    return [book_to_dict(b, smap.get(b.id, [])) for b in books]


def interaction_dicts(user_id):
    rows = Interaction.query.filter_by(user_id=user_id).all()
    return [
        {"itemId": r.item_id, "kind": r.kind, "title": r.title, "authors": r.authors or [],
         "terms": r.terms or [], "genres": r.genres or []}
        for r in rows
    ]


def load_taste():
    user = current_user()
    profile = profile_to_dict(current_profile())
    return build_taste(profile, library_dicts(user.id), interaction_dicts(user.id))
