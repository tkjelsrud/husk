from __future__ import annotations

from datetime import datetime, timezone

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


def fetch_work_entries(db, limit: int = 20):
    query = db.collection('entries').order_by('createdAt', direction=firestore.Query.DESCENDING).limit(limit * 5)
    docs = []
    for doc in query.stream():
        data = doc.to_dict() or {}
        if data.get('category') == 'work':
            docs.append(doc)
        if len(docs) >= limit:
            break
    return docs


def create_work_entry(db, text_input: str, added_by_email: str = 'api@local', added_by_uid: str = 'api-local'):
    payload = {
        'textInput': text_input,
        'category': 'work',
        'priority': 'normal',
        'processed': False,
        'dueDate': None,
        'addedByUid': added_by_uid,
        'addedByEmail': added_by_email,
        'createdAt': firestore.SERVER_TIMESTAMP,
    }
    ref = db.collection('entries').document()
    ref.set(payload)
    return ref


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
