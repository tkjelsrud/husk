from __future__ import annotations

import re
from datetime import datetime, time, timedelta, timezone

from .model_client import classify_entry
from .schemas import ENTRY_CATEGORIES, ENTRY_PRIORITIES


PROCESSOR_VERSION = 'husk-backend-v1'

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


def process_entry(settings, entry: dict):
    text_input = str(entry.get('textInput', '')).strip()
    now = datetime.now(timezone.utc)

    rule_due_date = _extract_due_date(text_input, now)
    rule_priority = _extract_priority(text_input)
    rule_category = _extract_category(text_input)

    result = classify_entry(
        model=settings.opencode_model,
        text_input=text_input,
        current_time=now.isoformat(),
    )

    category = _normalize_category(rule_category or result.get('category'))
    priority = _normalize_priority(rule_priority or result.get('priority'))
    due_date = rule_due_date or _normalize_due_date(result.get('dueDate'))

    return {
        'category': category,
        'priority': priority,
        'dueDate': due_date,
        'processingSummary': str(result.get('summary', '')).strip(),
        'processorVersion': PROCESSOR_VERSION,
        'lastError': firestore_delete(),
        'lastTriedAt': firestore_delete(),
    }


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
        return value
    return datetime.fromisoformat(str(value).replace('Z', '+00:00'))


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
    return datetime.combine(target_date, time(hour=9, minute=0), tzinfo=timezone.utc)


def firestore_delete():
    from firebase_admin import firestore
    return firestore.DELETE_FIELD
