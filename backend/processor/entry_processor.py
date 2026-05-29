from __future__ import annotations

import re
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from .calendar_client import sync_calendar_event
from .schemas import ENTRY_CATEGORIES, ENTRY_PRIORITIES


PROCESSOR_VERSION = 'husk-backend-v1'
DEFAULT_TIMEZONE = ZoneInfo('Europe/Oslo')
DEFAULT_DUE_HOUR = 8

HIGH_PRIORITY_HINTS = [
    'important',
    'viktig',
]


def process_entry(settings, entry: dict, entry_id: str | None = None):
    text_input = str(entry.get('textInput', '')).strip()
    now = datetime.now(DEFAULT_TIMEZONE)

    due_date = _extract_due_date(text_input, now)
    priority = _normalize_priority(_extract_priority(text_input))
    category = _normalize_category(entry.get('category'))

    payload = {
        'category': category,
        'priority': priority,
        'dueDate': due_date,
        'processingSummary': '',
        'processorVersion': PROCESSOR_VERSION,
        'lastError': firestore_delete(),
        'lastTriedAt': firestore_delete(),
    }

    calendar_result = {
        'calendarEventCreated': False,
        'calendarSyncStatus': 'not_attempted',
        'calendarSyncTime': due_date.isoformat() if due_date else None,
    }
    if entry_id:
        calendar_result = sync_calendar_event(settings, entry_id, entry, payload)
        payload.update(calendar_result)

    payload['processingDetails'] = {
        'processedAtLocal': now.isoformat(),
        'inputText': text_input,
        'rules': {
            'priority': priority,
            'dueDate': due_date.isoformat() if due_date else None,
        },
        'final': {
            'category': category,
            'priority': priority,
            'dueDate': due_date.isoformat() if due_date else None,
        },
        'calendar': {
            'eligible': category == 'family' and due_date is not None,
            'status': calendar_result.get('calendarSyncStatus'),
            'eventCreated': calendar_result.get('calendarEventCreated', False),
            'eventId': calendar_result.get('calendarEventId'),
            'calendarId': calendar_result.get('calendarId'),
            'scheduledTime': calendar_result.get('calendarSyncTime'),
        },
    }

    return payload


def _normalize_category(value):
    category = str(value or 'unknown').strip().lower()
    if category == 'jobb':
        category = 'work'
    if category == 'husk mcp':
        category = 'huskmcp'
    if category not in ENTRY_CATEGORIES:
        return 'unknown'
    return category


def _normalize_priority(value):
    priority = str(value or 'normal').strip().lower()
    if priority not in ENTRY_PRIORITIES:
        return 'normal'
    return priority


def _normalize_due_date(value):
    if value in (None, '', 'null'):
        return None
    if isinstance(value, datetime):
        return value.astimezone(DEFAULT_TIMEZONE) if value.tzinfo else value.replace(tzinfo=DEFAULT_TIMEZONE)

    raw_value = str(value).strip()
    if 'T' not in raw_value:
        return _at_default_time(datetime.fromisoformat(raw_value).date())

    normalized = raw_value.replace('Z', '+00:00')
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        if parsed.time() == time(0, 0):
            return _at_default_time(parsed.date())
        return parsed.replace(tzinfo=DEFAULT_TIMEZONE)
    return parsed.astimezone(DEFAULT_TIMEZONE)


def _extract_priority(text_input: str):
    lowered = text_input.lower()
    if any(hint in lowered for hint in HIGH_PRIORITY_HINTS):
        return 'high'
    return 'normal'


def _extract_due_date(text_input: str, now: datetime):
    lowered = text_input.lower()

    if 'i morgen' in lowered or 'tomorrow' in lowered:
        return _at_default_time((now + timedelta(days=1)).date())

    if 'neste uke' in lowered or 'next week' in lowered:
        next_week = now.date() + timedelta(days=(7 - now.weekday()))
        return _at_default_time(next_week)

    iso_match = re.search(r'\b(20\d{2}-\d{2}-\d{2})\b', lowered)
    if iso_match:
        return _at_default_time(datetime.fromisoformat(iso_match.group(1)).date())

    norwegian_match = re.search(r'\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b', lowered)
    if norwegian_match:
        day = int(norwegian_match.group(1))
        month = int(norwegian_match.group(2))
        # Validate month and day to avoid matching times like 18.00
        if not (1 <= month <= 12 and 1 <= day <= 31):
            return None
        year = norwegian_match.group(3)
        if year is None:
            year_value = now.year
        else:
            year_value = int(year)
            if year_value < 100:
                year_value += 2000
        return _at_default_time(datetime(year_value, month, day, tzinfo=timezone.utc).date())

    return None


def _at_default_time(target_date):
    return datetime.combine(target_date, time(hour=DEFAULT_DUE_HOUR, minute=0), tzinfo=DEFAULT_TIMEZONE)


def firestore_delete():
    from firebase_admin import firestore
    return firestore.DELETE_FIELD
