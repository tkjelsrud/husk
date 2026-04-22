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
    seen_ids = set()
    total_processed = 0

    while True:
        docs = [doc for doc in fetch_unprocessed_entries(db, settings.poll_limit) if doc.id not in seen_ids]
        if not docs:
            break

        logging.info('Found %s unprocessed entries in batch', len(docs))

        for doc in docs:
            seen_ids.add(doc.id)
            data = doc.to_dict() or {}
            try:
                payload = process_entry(settings, data)
                update_processed_entry(db, doc.id, payload)
                total_processed += 1
                logging.info('Processed %s', doc.id)
            except Exception as err:
                logging.exception('Failed processing %s', doc.id)
                update_entry_error(db, doc.id, str(err))

        if len(docs) < settings.poll_limit:
            break

    logging.info('Finished processing run, processed=%s', total_processed)


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
