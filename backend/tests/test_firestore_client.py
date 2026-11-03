from unittest import mock
from unittest.mock import MagicMock
from datetime import datetime, timezone
import pytest

from backend.processor.firestore_client import create_entry, update_entry, fetch_entries, fetch_tavle_notes

@pytest.fixture
def mock_firestore_client():
    """Fixture to mock the Firestore client"""
    mocked_db = MagicMock()
    return mocked_db

@pytest.fixture
def sample_entry():
    """Sample entry for testing"""
    return {
        "id": "test_id",
        "textInput": "Sample text",
        "category": "work",
        "priority": "normal",
        "processed": False,
        "done": False,
        "createdAt": datetime(2023, 1, 1, tzinfo=timezone.utc),

    }

def test_create_entry(mock_firestore_client):
    """Test creating an entry"""
    ref_mock = MagicMock()
    mock_firestore_client.collection.return_value.document.return_value = ref_mock

    create_entry(
        mock_firestore_client,
        text_input="New entry",
        category="work",
        priority="normal",
        added_by_email="test@example.com",
        added_by_uid="user123",
    )

    ref_mock.set.assert_called_once()
    payload = ref_mock.set.call_args[0][0]

    assert payload["textInput"] == "New entry"
    assert payload["category"] == "work"
    assert payload["priority"] == "normal"
    assert "createdAt" in payload

def test_update_entry(mock_firestore_client, sample_entry):
    """Test updating an entry, ensuring createdAt updates correctly"""
    doc_ref = MagicMock()
    doc_ref.get.return_value.exists = True
    doc_ref.get.return_value.to_dict.return_value = sample_entry

    mock_firestore_client.collection.return_value.document.return_value = doc_ref

    updated_entry = update_entry(mock_firestore_client, "test_id", {"textInput": "Updated text"})

    doc_ref.update.assert_called_once()
    updates = doc_ref.update.call_args[0][0]

    assert updates["textInput"] == "Updated text"
    assert "createdAt" in updates

def test_fetch_entries(mock_firestore_client, sample_entry):
    """Test fetching entries sorted by createdAt"""
    entry_mock = MagicMock()
    entry_mock.id = sample_entry["id"]
    entry_mock.to_dict.return_value = sample_entry

    mock_firestore_client.collection.return_value.order_by.return_value.limit.return_value.stream.return_value = [
        entry_mock
    ]

    entries = fetch_entries(mock_firestore_client, limit=10, category="all")
    
    assert len(entries) == 1
    assert entries[0].id == "test_id"
    


def test_fetch_tavle_notes_skips_lines_and_empty_and_sorts():
    def snap(doc_id, data):
        m = MagicMock()
        m.id = doc_id
        m.to_dict.return_value = data
        return m

    db = MagicMock()
    db.collection.return_value.stream.return_value = [
        snap("b", {"text": "below", "x": 0, "y": 100}),
        snap("line", {"kind": "line", "text": "", "x": 0, "y": 0, "orientation": "h", "length": 50}),
        snap("empty", {"text": "  ", "x": 0, "y": 0}),
        snap("a", {"text": "top", "x": 10, "y": -20}),
    ]

    notes = fetch_tavle_notes(db)

    db.collection.assert_called_with("tavle")
    assert [n["id"] for n in notes] == ["a", "b"]
