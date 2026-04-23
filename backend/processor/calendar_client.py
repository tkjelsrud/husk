from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build


SCOPES = ['https://www.googleapis.com/auth/calendar.events']
CALENDAR_TIMEZONE = 'Europe/Oslo'
CALENDAR_ZONEINFO = ZoneInfo(CALENDAR_TIMEZONE)


def sync_calendar_event(settings, entry_id: str, entry: dict, payload: dict):
    if not _should_sync(payload):
        logging.info('Skipping calendar sync for %s', entry_id)
        return {
            'calendarEventCreated': False,
            'calendarSyncStatus': 'skipped',
            'calendarSyncTime': payload.get('dueDate').astimezone(CALENDAR_ZONEINFO).isoformat() if payload.get('dueDate') else None,
        }

    token_path = settings.google_oauth_token_path
    if not token_path:
        raise RuntimeError('GOOGLE_OAUTH_TOKEN_PATH is not configured')
    if not settings.google_calendar_id:
        raise RuntimeError('GOOGLE_CALENDAR_ID is not configured')

    service = _build_service(settings, token_path)
    due_date = payload['dueDate'].astimezone(CALENDAR_ZONEINFO)
    summary = payload.get('processingSummary') or str(entry.get('textInput', '')).strip()[:80]
    event_body = {
        'summary': summary or 'Husk',
        'description': _build_description(entry_id, entry),
        'start': {'dateTime': due_date.isoformat(), 'timeZone': CALENDAR_TIMEZONE},
        'end': {'dateTime': (due_date + timedelta(hours=1)).isoformat(), 'timeZone': CALENDAR_TIMEZONE},
    }

    existing_event_id = str(entry.get('calendarEventId', '')).strip()
    if existing_event_id:
        event = service.events().update(
            calendarId=settings.google_calendar_id,
            eventId=existing_event_id,
            body=event_body,
        ).execute()
        logging.info('Updated calendar event for %s: %s', entry_id, event['id'])
        status = 'updated'
    else:
        event = service.events().insert(
            calendarId=settings.google_calendar_id,
            body=event_body,
        ).execute()
        logging.info('Created calendar event for %s: %s', entry_id, event['id'])
        status = 'created'

    return {
        'calendarId': settings.google_calendar_id,
        'calendarEventCreated': True,
        'calendarEventId': event['id'],
        'calendarSyncStatus': status,
        'calendarSyncTime': due_date.isoformat(),
        'calendarSyncedAt': datetime.now(timezone.utc),
        'calendarLastError': firestore_delete(),
    }


def _should_sync(payload: dict):
    return payload.get('category') != 'work' and payload.get('dueDate') is not None


def _build_service(settings, token_path: str):
    token_file = Path(token_path)
    token_file.parent.mkdir(parents=True, exist_ok=True)

    creds = None
    if token_file.exists():
        creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            client_config = _load_client_config(settings)
            flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
            creds = flow.run_local_server(port=0)
        token_file.write_text(creds.to_json(), encoding='utf-8')

    return build('calendar', 'v3', credentials=creds, cache_discovery=False)


def _build_description(entry_id: str, entry: dict):
    text_input = str(entry.get('textInput', '')).strip()
    return f'Husk entry {entry_id}\n\n{text_input}'.strip()


def _load_client_config(settings):
    if settings.google_oauth_client_path:
        client_path = Path(settings.google_oauth_client_path)
        if client_path.exists():
            with client_path.open('r', encoding='utf-8') as fh:
                return json.load(fh)

    if settings.google_oauth_client_id and settings.google_oauth_client_secret:
        return {
            'installed': {
                'client_id': settings.google_oauth_client_id,
                'client_secret': settings.google_oauth_client_secret,
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
                'redirect_uris': ['http://localhost'],
            }
        }

    raise RuntimeError('Google Calendar OAuth client is not configured')


def firestore_delete():
    from firebase_admin import firestore
    return firestore.DELETE_FIELD
