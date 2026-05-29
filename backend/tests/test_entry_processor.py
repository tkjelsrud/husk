from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from backend.processor.entry_processor import process_entry
from backend.processor.calendar_client import _should_sync


# --- _should_sync ---

def test_should_sync_family_with_due_date():
    payload = {'category': 'family', 'dueDate': datetime(2026, 6, 1, tzinfo=timezone.utc)}
    assert _should_sync(payload) is True


def test_should_sync_family_without_due_date():
    payload = {'category': 'family', 'dueDate': None}
    assert _should_sync(payload) is False


@pytest.mark.parametrize('category', ['work', 'general', 'houseproj', 'creative', 'huskmcp', 'unknown'])
def test_should_sync_non_family_skipped(category):
    payload = {'category': category, 'dueDate': datetime(2026, 6, 1, tzinfo=timezone.utc)}
    assert _should_sync(payload) is False


# --- process_entry: category handling ---

def _make_settings():
    s = MagicMock()
    s.opencode_bin = None
    s.opencode_model = None
    s.google_oauth_token_path = None
    s.google_calendar_id = None
    return s


@patch('backend.processor.entry_processor.sync_calendar_event')
def test_process_entry_respects_explicit_category(mock_sync):
    mock_sync.return_value = {'calendarEventCreated': False, 'calendarSyncStatus': 'skipped', 'calendarSyncTime': None}
    entry = {'textInput': 'Fix the roof', 'category': 'houseproj'}
    result = process_entry(_make_settings(), entry, entry_id='abc')
    assert result['category'] == 'houseproj'


@patch('backend.processor.entry_processor.sync_calendar_event')
def test_process_entry_respects_work_category(mock_sync):
    mock_sync.return_value = {'calendarEventCreated': False, 'calendarSyncStatus': 'skipped', 'calendarSyncTime': None}
    entry = {'textInput': 'Send email to client', 'category': 'work'}
    result = process_entry(_make_settings(), entry, entry_id='abc')
    assert result['category'] == 'work'


@patch('backend.processor.entry_processor.sync_calendar_event')
def test_process_entry_unknown_stays_unknown(mock_sync):
    mock_sync.return_value = {'calendarEventCreated': False, 'calendarSyncStatus': 'skipped', 'calendarSyncTime': None}
    entry = {'textInput': 'Something uncategorised', 'category': 'unknown'}
    result = process_entry(_make_settings(), entry, entry_id='abc')
    assert result['category'] == 'unknown'


# --- process_entry: date extraction still works ---

@patch('backend.processor.entry_processor.sync_calendar_event')
def test_process_entry_extracts_norwegian_date(mock_sync):
    mock_sync.return_value = {'calendarEventCreated': False, 'calendarSyncStatus': 'skipped', 'calendarSyncTime': None}
    entry = {'textInput': 'Tannlege 15.06.2026', 'category': 'family'}
    result = process_entry(_make_settings(), entry, entry_id='abc')
    assert result['dueDate'] is not None
    assert result['dueDate'].day == 15
    assert result['dueDate'].month == 6
    assert result['dueDate'].year == 2026


@patch('backend.processor.entry_processor.sync_calendar_event')
def test_process_entry_no_date_gives_none(mock_sync):
    mock_sync.return_value = {'calendarEventCreated': False, 'calendarSyncStatus': 'skipped', 'calendarSyncTime': None}
    entry = {'textInput': 'Handle noe', 'category': 'general'}
    result = process_entry(_make_settings(), entry, entry_id='abc')
    assert result['dueDate'] is None


# --- process_entry: calendar not called for non-family ---

@patch('backend.processor.entry_processor.sync_calendar_event')
def test_process_entry_no_calendar_for_work(mock_sync):
    mock_sync.return_value = {'calendarEventCreated': False, 'calendarSyncStatus': 'skipped', 'calendarSyncTime': None}
    entry = {'textInput': 'Jobb møte 2026-06-10', 'category': 'work'}
    result = process_entry(_make_settings(), entry, entry_id='abc')
    assert result['processingDetails']['calendar']['eligible'] is False


@patch('backend.processor.entry_processor.sync_calendar_event')
def test_process_entry_calendar_eligible_for_family_with_date(mock_sync):
    mock_sync.return_value = {'calendarEventCreated': False, 'calendarSyncStatus': 'skipped', 'calendarSyncTime': None}
    entry = {'textInput': 'Barnebursdag 2026-06-20', 'category': 'family'}
    result = process_entry(_make_settings(), entry, entry_id='abc')
    assert result['processingDetails']['calendar']['eligible'] is True
