from __future__ import annotations

import json
import os
import sys

from .processor.config import load_settings
from .processor.firestore_client import create_client, create_entry, delete_entry, fetch_entries, get_entry, update_entry
from .processor.schemas import ENTRY_CATEGORIES, ENTRY_PRIORITIES


SERVER_INFO = {
    'name': 'husk-firebase',
    'version': '0.1.0',
}

LIST_ENTRY_CATEGORIES = ['all', *ENTRY_CATEGORIES]


def get_db():
    settings = load_settings()
    os.environ.setdefault('GOOGLE_CLOUD_PROJECT', settings.firebase_project_id)
    db = create_client(settings.firebase_service_account_path, settings.firebase_project_id)
    return settings, db


def serialize_entry(entry: dict):
    def maybe_iso(value):
        return value.isoformat() if getattr(value, 'isoformat', None) else value

    return {
        'id': entry.get('id'),
        'textInput': entry.get('textInput'),
        'category': entry.get('category'),
        'priority': entry.get('priority'),
        'processed': entry.get('processed'),
        'dueDate': maybe_iso(entry.get('dueDate')),
        'createdAt': maybe_iso(entry.get('createdAt')),
        'processingSummary': entry.get('processingSummary'),
    }


def normalize_category(value, *, allow_all: bool = False, default: str = 'work'):
    category = str(value or default).strip().lower()
    if category == 'jobb':
        category = 'work'
    if category == 'husk mcp':
        category = 'huskmcp'

    allowed_categories = LIST_ENTRY_CATEGORIES if allow_all else ENTRY_CATEGORIES
    if category not in allowed_categories:
        return None
    return category


def normalize_priority(value, default: str = 'normal'):
    priority = str(value or default).strip().lower()
    if priority not in ENTRY_PRIORITIES:
        return None
    return priority


def success_response(request_id, result):
    return {
        'jsonrpc': '2.0',
        'id': request_id,
        'result': result,
    }


def error_response(request_id, code, message):
    return {
        'jsonrpc': '2.0',
        'id': request_id,
        'error': {
            'code': code,
            'message': message,
        },
    }


def handle_initialize(request_id, params):
    client_version = params.get('protocolVersion', '2024-11-05')
    return success_response(request_id, {
        'protocolVersion': client_version,
        'serverInfo': SERVER_INFO,
        'capabilities': {
            'tools': {},
        },
    })


def handle_tools_list(request_id):
    return success_response(request_id, {
        'tools': [
            {
                'name': 'list_work_items',
                'description': 'List recent Firestore entries. Defaults to work items unless a category is specified.',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'limit': {
                            'type': 'integer',
                            'minimum': 1,
                            'maximum': 100,
                            'default': 20,
                        },
                        'category': {
                            'type': 'string',
                            'enum': LIST_ENTRY_CATEGORIES,
                            'default': 'work',
                        },
                    },
                },
            },
            {
                'name': 'add_work_item',
                'description': 'Add a new Firestore entry. Defaults to a work item unless a category is specified.',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'textInput': {'type': 'string'},
                        'category': {
                            'type': 'string',
                            'enum': ENTRY_CATEGORIES,
                            'default': 'work',
                        },
                        'priority': {
                            'type': 'string',
                            'enum': ENTRY_PRIORITIES,
                            'default': 'normal',
                        },
                        'addedByEmail': {'type': 'string'},
                        'addedByUid': {'type': 'string'},
                    },
                    'required': ['textInput'],
                },
            },
            {
                'name': 'edit_work_item',
                'description': 'Edit an existing Firestore entry by id, regardless of category.',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'id': {'type': 'string'},
                        'textInput': {'type': 'string'},
                        'category': {
                            'type': 'string',
                            'enum': ENTRY_CATEGORIES,
                        },
                        'priority': {
                            'type': 'string',
                            'enum': ENTRY_PRIORITIES,
                        },
                    },
                    'required': ['id'],
                },
            },
            {
                'name': 'delete_work_item',
                'description': 'Delete a Firestore entry by document id, regardless of category.',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'id': {'type': 'string'},
                    },
                    'required': ['id'],
                },
            },
        ]
    })


def handle_tools_call(request_id, params):
    tool_name = params.get('name')
    arguments = params.get('arguments') or {}
    settings, db = get_db()

    if tool_name == 'list_work_items':
        limit = int(arguments.get('limit', 20))
        category = normalize_category(arguments.get('category'), allow_all=True)
        if category is None:
            allowed = ', '.join(LIST_ENTRY_CATEGORIES)
            return error_response(request_id, -32602, f'category must be one of: {allowed}')

        docs = fetch_entries(db, limit=max(1, min(limit, 100)), category=category)
        items = [serialize_entry({'id': doc.id, **(doc.to_dict() or {})}) for doc in docs]
        return success_response(request_id, {
            'content': [
                {
                    'type': 'text',
                    'text': json.dumps({'items': items, 'category': category}, ensure_ascii=True),
                }
            ]
        })

    if tool_name == 'add_work_item':
        text_input = str(arguments.get('textInput', '')).strip()
        if not text_input:
            return error_response(request_id, -32602, 'textInput is required')
        if len(text_input) > 1500:
            return error_response(request_id, -32602, 'textInput must be 1500 characters or less')

        category = normalize_category(arguments.get('category'))
        if category is None:
            allowed = ', '.join(ENTRY_CATEGORIES)
            return error_response(request_id, -32602, f'category must be one of: {allowed}')

        priority = normalize_priority(arguments.get('priority'))
        if priority is None:
            allowed = ', '.join(ENTRY_PRIORITIES)
            return error_response(request_id, -32602, f'priority must be one of: {allowed}')

        added_by_email = str(arguments.get('addedByEmail', 'mcp@local')).strip() or 'mcp@local'
        added_by_uid = str(arguments.get('addedByUid', 'mcp-local')).strip() or 'mcp-local'
        ref = create_entry(
            db,
            text_input,
            category=category,
            priority=priority,
            added_by_email=added_by_email,
            added_by_uid=added_by_uid,
        )
        entry = get_entry(db, ref.id)
        return success_response(request_id, {
            'content': [
                {
                    'type': 'text',
                    'text': json.dumps({'item': serialize_entry(entry)}, ensure_ascii=True),
                }
            ]
        })

    if tool_name == 'edit_work_item':
        entry_id = str(arguments.get('id', '')).strip()
        if not entry_id:
            return error_response(request_id, -32602, 'id is required')

        updates = {}

        if 'textInput' in arguments:
            text_input = str(arguments.get('textInput', '')).strip()
            if not text_input:
                return error_response(request_id, -32602, 'textInput must be a non-empty string when provided')
            if len(text_input) > 1500:
                return error_response(request_id, -32602, 'textInput must be 1500 characters or less')
            updates['textInput'] = text_input

        if 'category' in arguments:
            category = normalize_category(arguments.get('category'))
            if category is None:
                allowed = ', '.join(ENTRY_CATEGORIES)
                return error_response(request_id, -32602, f'category must be one of: {allowed}')
            updates['category'] = category

        if 'priority' in arguments:
            priority = normalize_priority(arguments.get('priority'))
            if priority is None:
                allowed = ', '.join(ENTRY_PRIORITIES)
                return error_response(request_id, -32602, f'priority must be one of: {allowed}')
            updates['priority'] = priority

        if not updates:
            return error_response(request_id, -32602, 'at least one of textInput, category, or priority is required')

        entry = update_entry(db, entry_id, updates)
        if not entry:
            return error_response(request_id, -32004, 'item not found')

        return success_response(request_id, {
            'content': [
                {
                    'type': 'text',
                    'text': json.dumps({'item': serialize_entry(entry)}, ensure_ascii=True),
                }
            ]
        })

    if tool_name == 'delete_work_item':
        entry_id = str(arguments.get('id', '')).strip()
        if not entry_id:
            return error_response(request_id, -32602, 'id is required')
        deleted = delete_entry(db, entry_id)
        if not deleted:
            return error_response(request_id, -32004, 'item not found')
        return success_response(request_id, {
            'content': [
                {
                    'type': 'text',
                    'text': json.dumps({'deleted': True, 'id': entry_id}, ensure_ascii=True),
                }
            ]
        })

    return error_response(request_id, -32601, f'Unknown tool: {tool_name}')


def handle_request(message):
    method = message.get('method')
    request_id = message.get('id')
    params = message.get('params') or {}

    if method == 'initialize':
        return handle_initialize(request_id, params)
    if method == 'notifications/initialized':
        return None
    if method == 'tools/list':
        return handle_tools_list(request_id)
    if method == 'tools/call':
        return handle_tools_call(request_id, params)
    return error_response(request_id, -32601, f'Unknown method: {method}')


def main():
    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            response = error_response(None, -32700, 'Parse error')
            sys.stdout.write(json.dumps(response) + '\n')
            sys.stdout.flush()
            continue

        response = handle_request(message)
        if response is not None:
            sys.stdout.write(json.dumps(response) + '\n')
            sys.stdout.flush()


if __name__ == '__main__':
    main()
