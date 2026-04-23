from __future__ import annotations

import re
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from .calendar_client import sync_calendar_event
from .model_client import classify_entry
from .schemas import ENTRY_CATEGORIES, ENTRY_PRIORITIES


PROCESSOR_VERSION = 'husk-backend-v1'
DEFAULT_TIMEZONE = ZoneInfo('Europe/Oslo')
DEFAULT_DUE_HOUR = 8

CATEGORY_HINTS = {
    'work': [
        'work',
        'jobb',
        'mote',
        'meeting',
        'kunde',
        'customer',
        'office',
        'kontor',
        'deadline',
        'jira',
        'slack',
        'teams',
        'epost',
        'email',
        'prosjekt',
        'project',
        'arbeid',
        'kollega',
        'manager',
        'leder',
    ],
    'creative': [
        'creative',
        'kreativ',
        'skrive',
        'write',
        'art',
        'design',
        'tegne',
        'draw',
        'male',
        'paint',
        'music',
        'musikk',
        'foto',
        'photo',
        'video',
        'podcast',
    ],
    'houseproj': [
        'houseproj',
        'husprosjekt',
        'oppussing',
        'renovation',
        'bygg',
        'build',
        'snekker',
        'electrician',
        'elektriker',
        'plumber',
        'rorlegger',
        'bad',
        'kjokken',
        'kitchen',
        'garage',
        'garasje',
        'tak',
        'roof',
    ],
    'family': [
        'family',
        'familie',
        'barn',
        'kids',
        'school',
        'skole',
        'barnehage',
        'foreldre',
        'parents',
        'birthday',
        'bursdag',
        'anita',
        'sebastian',
        'verona',
    ],
    'general': [
        'general',
        'generelt',
        'ordne',
        'fix',
        'kjop',
        'buy',
        'handle',
        'remember',
        'husk',
        'todo',
        'to do',
    ],
}

HIGH_PRIORITY_HINTS = [
    'important',
    'viktig',
]


def process_entry(settings, entry: dict, entry_id: str | None = None):
    text_input = str(entry.get('textInput', '')).strip()
    now = datetime.now(DEFAULT_TIMEZONE)

    rule_due_date = _extract_due_date(text_input, now)
    rule_priority = _extract_priority(text_input)
    rule_category = _extract_category(text_input)

    model_result = classify_entry(
        opencode_bin=settings.opencode_bin,
        model=settings.opencode_model,
        text_input=text_input,
        current_time=now.isoformat(),
    )

    model_due_date = _normalize_due_date(model_result.get('dueDate'))
    category = _normalize_category(rule_category or model_result.get('category'))
    priority = _normalize_priority(rule_priority or model_result.get('priority'))
    due_date = rule_due_date or model_due_date

    payload = {
        'category': category,
        'priority': priority,
        'dueDate': due_date,
        'processingSummary': str(model_result.get('summary', '')).strip(),
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
            'category': rule_category,
            'priority': rule_priority,
            'dueDate': rule_due_date.isoformat() if rule_due_date else None,
        },
        'modelOutput': {
            'category': model_result.get('category'),
            'priority': model_result.get('priority'),
            'dueDate': model_due_date.isoformat() if model_due_date else model_result.get('dueDate'),
            'summary': str(model_result.get('summary', '')).strip(),
        },
        'final': {
            'category': category,
            'priority': priority,
            'dueDate': due_date.isoformat() if due_date else None,
            'processingSummary': payload['processingSummary'],
        },
        'calendar': {
            'eligible': category != 'work' and due_date is not None,
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


def _extract_category(text_input: str):
    lowered = text_input.lower()

    # Work gets priority because it will later feed work-side agents.
    if any(hint in lowered for hint in CATEGORY_HINTS['work']):
        return 'work'

    for category in ('creative', 'houseproj', 'family', 'general'):
        if any(hint in lowered for hint in CATEGORY_HINTS[category]):
            return category

    return None


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
