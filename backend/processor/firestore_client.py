from __future__ import annotations

from datetime import datetime, timezone

from .schemas import ENTRY_CATEGORIES, ENTRY_PRIORITIES

import firebase_admin
from firebase_admin import credentials, firestore


def create_client(service_account_path: str | None, project_id: str | None = None):
    if firebase_admin._apps:
        return firestore.client(app=firebase_admin.get_app())

    options = {'projectId': project_id} if project_id else None
    if service_account_path:
        app = firebase_admin.initialize_app(credentials.Certificate(service_account_path), options=options)
    else:
        app = firebase_admin.initialize_app(options=options)

    return firestore.client(app=app)


def fetch_unprocessed_entries(db, limit: int):
    query = (
        db.collection('entries')
        .where('processed', '==', False)
        .limit(limit)
    )
    return list(query.stream())


def fetch_entries(db, limit: int = 20, category: str = 'work'):
    query = db.collection('entries').order_by('createdAt', direction=firestore.Query.DESCENDING).limit(limit * 5)
    docs = []
    for doc in query.stream():
        data = doc.to_dict() or {}
        if category != 'all' and data.get('category') != category:
            continue
        docs.append(doc)
        if len(docs) >= limit:
            break
    return docs


def fetch_work_entries(db, limit: int = 20):
    return fetch_entries(db, limit=limit, category='work')


def create_entry(
    db,
    text_input: str,
    *,
    category: str = 'work',
    priority: str = 'normal',
    added_by_email: str = 'api@local',
    added_by_uid: str = 'api-local',
):
    normalized_category = str(category or 'work').strip().lower()
    if normalized_category == 'husk mcp':
        normalized_category = 'huskmcp'
    if normalized_category not in ENTRY_CATEGORIES:
        normalized_category = 'work'

    normalized_priority = str(priority or 'normal').strip().lower()
    if normalized_priority not in ENTRY_PRIORITIES:
        normalized_priority = 'normal'

    payload = {
        'textInput': text_input,
        'category': normalized_category,
        'priority': normalized_priority,
        'processed': False,
        'dueDate': None,
        'addedByUid': added_by_uid,
        'addedByEmail': added_by_email,
        'createdAt': firestore.SERVER_TIMESTAMP,
    }
    ref = db.collection('entries').document()
    ref.set(payload)
    return ref


def create_work_entry(db, text_input: str, added_by_email: str = 'api@local', added_by_uid: str = 'api-local'):
    return create_entry(db, text_input, category='work', added_by_email=added_by_email, added_by_uid=added_by_uid)


def delete_entry(db, doc_id: str):
    ref = db.collection('entries').document(doc_id)
    snapshot = ref.get()
    if not snapshot.exists:
        return False
    ref.delete()
    return True


def get_entry(db, doc_id: str):
    snapshot = db.collection('entries').document(doc_id).get()
    if not snapshot.exists:
        return None
    return {'id': snapshot.id, **(snapshot.to_dict() or {})}


def update_entry(db, doc_id: str, payload: dict):
    ref = db.collection('entries').document(doc_id)
    snapshot = ref.get()
    if not snapshot.exists:
        return None

    updates = {}

    if 'textInput' in payload:
        updates['textInput'] = payload['textInput']

    if 'category' in payload:
        category = str(payload['category'] or '').strip().lower()
        if category == 'husk mcp':
            category = 'huskmcp'
        if category in ENTRY_CATEGORIES:
            updates['category'] = category

    if 'priority' in payload:
        priority = str(payload['priority'] or '').strip().lower()
        if priority in ENTRY_PRIORITIES:
            updates['priority'] = priority

    if not updates:
        return {'id': snapshot.id, **(snapshot.to_dict() or {})}

    ref.update(updates)
    updated = ref.get()
    return {'id': updated.id, **(updated.to_dict() or {})}


def update_processed_entry(db, doc_id: str, payload: dict):
    payload = {
        **payload,
        'processed': True,
        'processedAt': datetime.now(timezone.utc),
    }
    db.collection('entries').document(doc_id).update(payload)


def update_entry_error(db, doc_id: str, error_message: str):
    db.collection('entries').document(doc_id).update({
        'lastError': error_message,
        'lastTriedAt': datetime.now(timezone.utc),
    })
