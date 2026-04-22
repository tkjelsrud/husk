# Husk Backend

Private backend worker for processing `husk` Firestore entries.

## What it does

1. polls Firestore for entries where `processed == false`
2. applies backend rules for due date, priority, and obvious work detection
3. sends entry text to `opencode run` for the remaining classification
3. writes back:
    - `category`
    - `priority`
   - `dueDate`
   - `processed = true`
   - `processedAt`
    - `processorVersion`
    - `processingSummary`

## Built-in rules

The processor reads text in Norwegian or English.

Rules applied before model fallback:

- if the text contains `important` or `viktig`, set `priority = high`
- otherwise set `priority = normal`
- if the text contains work-like hints, set `category = work`
- if the text contains `tomorrow` or `i morgen`, set due date to tomorrow
- if the text contains `next week` or `neste uke`, set due date to next week
- if the text contains explicit dates like `2026-04-30` or `30.04.2026`, parse them

## Local-only files

Create these locally on the server:

- `backend/.env`
- `backend/.secrets/firebase-service-account.json`
- `backend/.state/`

## Environment variables

Example `backend/.env`:

```env
OPENCODE_MODEL=
FIREBASE_PROJECT_ID=husk-f59b1
FIREBASE_SERVICE_ACCOUNT_PATH=/home/tkjelsrud/husk/backend/.secrets/firebase-service-account.json
POLL_LIMIT=10
```

## Run once

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
python -m backend.processor.main --once
```

## Scheduling

Recommended: `systemd` timer on Ubuntu.

Current deployment model can also use cron every 10 minutes between 06:00 and 22:00.
