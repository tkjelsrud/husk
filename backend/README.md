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
- `backend/.secrets/firebase-service-account.json` if you use a service account
- `backend/.secrets/google-oauth-client.json` for Google Calendar OAuth
- `backend/.secrets/google-calendar-token.json` after first calendar login
- `backend/.state/`

## Environment variables

Example `backend/.env`:

```env
OPENCODE_BIN=/home/tkjelsrud/.opencode/bin/opencode
OPENCODE_MODEL=
FIREBASE_PROJECT_ID=husk-f59b1
FIREBASE_SERVICE_ACCOUNT_PATH=/home/tkjelsrud/husk/backend/.secrets/firebase-service-account.json
GOOGLE_CALENDAR_ID=family01970815885943925752@group.calendar.google.com
GOOGLE_OAUTH_CLIENT_PATH=/home/tkjelsrud/husk/backend/.secrets/google-oauth-client.json
GOOGLE_OAUTH_TOKEN_PATH=/home/tkjelsrud/husk/backend/.secrets/google-calendar-token.json
POLL_LIMIT=25
```

`FIREBASE_SERVICE_ACCOUNT_PATH` is optional. If it is empty, the backend uses
Google Application Default Credentials from the local machine, for example
after running `gcloud auth application-default login`.

Google Calendar sync uses a separate local OAuth client and token because it
acts as your Google user against a shared family calendar.

## Run once

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
python -m backend.processor.main --once
```

## Work MCP Server

Run a small stdio MCP server for Firestore work items:

```sh
.venv/bin/python -m backend.mcp_server
```

Tools exposed:

- `list_work_items`
- `add_work_item`
- `delete_work_item`

The MCP server talks directly to Firestore and is separate from the remote
processing worker.

Example MCP client config:

```json
{
  "mcpServers": {
    "husk-firebase": {
      "command": "/Users/tkjelsrud/Public/husk/.venv/bin/python",
      "args": ["-m", "backend.mcp_server"],
      "cwd": "/Users/tkjelsrud/Public/husk"
    }
  }
}
```

## Scheduling

Recommended deployment here: cron every 10 minutes between 06:00 and 22:00.

The included shell wrapper skips processing cleanly if local-only prerequisites are
missing, for example:

- Firebase service account JSON is missing and ADC is not configured
- Google Calendar OAuth client JSON is missing when calendar sync is enabled
- `opencode` is not installed yet
- `opencode` is not authenticated yet
