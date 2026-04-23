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
