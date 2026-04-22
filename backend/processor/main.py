from __future__ import annotations

import argparse
import logging

from .config import load_settings
from .entry_processor import process_entry
from .firestore_client import (
    create_client,
    fetch_unprocessed_entries,
    update_entry_error,
    update_processed_entry,
)


def run_once():
    settings = load_settings()
    db = create_client(settings.firebase_service_account_path)
    docs = fetch_unprocessed_entries(db, settings.poll_limit)

    logging.info('Found %s unprocessed entries', len(docs))

    for doc in docs:
        data = doc.to_dict() or {}
        try:
            payload = process_entry(settings, data)
            update_processed_entry(db, doc.id, payload)
            logging.info('Processed %s', doc.id)
        except Exception as err:
            logging.exception('Failed processing %s', doc.id)
            update_entry_error(db, doc.id, str(err))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true', help='Run one processing pass')
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

    if args.once:
        run_once()
        return

    run_once()


if __name__ == '__main__':
    main()
