from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone


def fetch_fixed_entries(db) -> list[dict]:
    """Fetch all fixed entries from Firestore and serialize them."""
    query = db.collection('entries').where('entryType', '==', 'fixed')
    
    entries = []
    for doc in query.stream():
        data = doc.to_dict() or {}
        entry = {'id': doc.id}
        
        # Copy all fields
        for key, value in data.items():
            # Convert datetime objects to ISO strings
            if hasattr(value, 'isoformat'):
                entry[key] = value.isoformat()
            else:
                entry[key] = value
        
        entries.append(entry)
    
    return entries


def export_fixed_entries(db, export_path: str) -> bool:
    """
    Export fixed entries to JSON file.
    
    Returns True if file was written, False if unchanged or on error.
    Keeps old file intact on errors.
    """
    try:
        # Fetch entries
        entries = fetch_fixed_entries(db)
        
        # Build export data
        export_data = {
            'exported_at': datetime.now(timezone.utc).isoformat(),
            'count': len(entries),
            'entries': entries,
        }
        
        # Serialize with consistent formatting (sort_keys for stable output)
        new_content = json.dumps(export_data, indent=2, sort_keys=True, ensure_ascii=False)
        
        # Check if content changed (compare entries only, ignore exported_at)
        needs_write = True
        if os.path.exists(export_path):
            try:
                with open(export_path, 'r', encoding='utf-8') as f:
                    old_data = json.load(f)
                
                # Compare entries array only (ignore timestamp)
                if old_data.get('entries') == export_data['entries']:
                    needs_write = False
            except Exception as err:
                logging.debug('Could not read existing export file: %s', err)
                # Treat as needing write
        
        if not needs_write:
            return False
        
        # Write new file
        with open(export_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        # Set readable permissions (644)
        os.chmod(export_path, 0o644)
        
        return True
        
    except Exception as err:
        logging.error('Failed to export fixed entries to %s: %s', export_path, err)
        return False
