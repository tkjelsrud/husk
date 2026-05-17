# Husk

Small private Firebase web app for a shared input queue.

This is a plain static site. There is no bundler, framework, or npm-based app runtime.

## What it does

- Google login with a small allowlist
- persistent browser session via Firebase local auth persistence
- one protected input form for 1 to 5 lines of text plus category
- each saved record gets a server timestamp, `priority: normal`, `processed: false`, and empty due date
- separate read-only listing page for all submitted entries
- **Fixed entries**: Long-term reminders with recurrence patterns (daily, weekly, monthly, yearly)
- **JSON API**: Read-only API for home automation systems to access fixed entries

## Firebase setup

Set this up as its own Firebase project.

### 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com).
2. Create a new project for `husk`.
3. Enable **Google** under Authentication -> Sign-in method.
4. Add your deployment domain under Authentication -> Settings -> Authorized domains.
5. Create Firestore in production mode.

### 2. Add local config files

Create `js/firebase-config.js` from [`js/firebase-config.example.js`](js/firebase-config.example.js).

Create `js/runtime-config.js` from [`js/runtime-config.example.js`](js/runtime-config.example.js) and replace the placeholder email:

```js
export const runtimeConfig = {
  allowedEmails: [
    'first-user@example.com',
    'second-user@example.com'
  ]
};
```

### 3. Firestore rules

Use [`firestore.rules.example`](firestore.rules.example) as the starting point.

Replace the placeholder emails and publish the rules in Firebase.

The app stores records in the `entries` collection with this shape:

```json
{
  "textInput": "line 1\nline 2",
  "category": "unknown",
  "priority": "normal",
  "processed": false,
  "dueDate": null,
  "addedByUid": "firebase-user-uid",
  "addedByEmail": "user@example.com",
  "createdAt": "server timestamp"
}
```

Allowed categories:

- `unknown`
- `work`
- `creative`
- `houseproj`
- `family`
- `general`
- `huskmcp`

Allowed priorities:

- `low`
- `normal`
- `high`

## Backend worker

This repo also supports a separate private backend worker under `backend/`.

The backend is meant to run on a private server, poll Firestore for unprocessed
entries, enrich them with `opencode`, and write the results back.

No backend secrets are committed to git.

Current backend rule set:

- Norwegian and English text is supported
- `important` or `viktig` sets `priority = high`
- otherwise `priority = normal`
- obvious work-related text is categorized as `work`
- `tomorrow` / `i morgen` sets due date to tomorrow
- `next week` / `neste uke` sets due date to next week

## Local run

This is a static app. Serve it locally with any simple file server, for example:

```sh
python3 -m http.server 8000
```

Then open the served URL in the browser.

## GitHub Pages

The repo includes a GitHub Pages workflow that writes `js/firebase-config.js`
and `js/runtime-config.js` during deploy from repository secrets.

Add these GitHub repository secrets before enabling Pages from
`GitHub Actions`:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID`
- `FIREBASE_ALLOWED_EMAIL_1`
- `FIREBASE_ALLOWED_EMAIL_2`

No Firebase keys or personal emails need to be committed to git.

## Tests

Run:

```sh
node --test
```

The test suite currently covers the 1 to 5 line validation helper.

## Fixed Entries

Fixed entries are long-term reminders that can be used for recurring events like:
- Birthdays (yearly: specific MM-DD date)
- Weekly routines (Monday, Tuesday, etc.)
- Monthly bills (1st of month, 15th, etc.)
- Daily habits

### Recurrence Patterns

- **None**: Single static reminder
- **Daily**: Repeats every day
- **Weekly**: Repeats on selected days of the week
- **Monthly**: Repeats on a specific day of the month (1-31)
- **Yearly**: Repeats on a specific date (MM-DD format)

### API Access

Fixed entries can be accessed via a JSON API for home automation systems.

#### Setup

1. Set `HUSK_API_TOKEN` in `backend/.env`:
```env
HUSK_API_TOKEN=your-secret-token-here
```

2. Run the API server:
```sh
cd backend
python -m api_server
```

The API server runs on port 5000 by default (configurable via `PORT` env var).

#### Endpoints

**Health Check**
```bash
GET /health
# No authentication required
```

**Get All Fixed Entries**
```bash
GET /api/fixed-entries
Authorization: Bearer your-secret-token-here

# Response:
{
  "entries": [
    {
      "id": "abc123",
      "textInput": "Mom's birthday",
      "category": "family",
      "entryType": "fixed",
      "recurrence": {
        "type": "yearly",
        "date": "05-17"
      },
      "createdAt": "2026-05-17T10:30:00",
      "addedByEmail": "user@example.com"
    }
  ],
  "count": 1,
  "timestamp": "2026-05-17T14:30:00"
}
```

**Get Today's Fixed Entries**
```bash
GET /api/fixed-entries/today
Authorization: Bearer your-secret-token-here

# Filters entries matching today's:
# - Daily recurrence
# - Weekly recurrence (matching weekday)
# - Monthly recurrence (matching day of month)
# - Yearly recurrence (matching MM-DD)
```

#### Example: Home Automation

```bash
# Get today's reminders
curl -H "Authorization: Bearer your-secret-token-here" \
  http://localhost:5000/api/fixed-entries/today
```

### Local JSON Export

For home automation systems on the same server, fixed entries are automatically exported to a local JSON file - no API server needed.

#### How it Works

The backend processor exports all fixed entries to `/tmp/husk_fixed_entries.json` after each processing run:
- File only updates when content changes (preserves mtime for efficient caching)
- Runs automatically with the processor (every 10 min during active hours, hourly at night)
- On errors, keeps existing file intact
- File is readable by all users (`chmod 644`)

#### Configuration

Set in `backend/.env` (defaults to `/tmp/husk_fixed_entries.json` if not specified):
```env
FIXED_EXPORT_PATH=/tmp/husk_fixed_entries.json
```

#### JSON Format

```json
{
  "exported_at": "2026-05-17T18:30:00Z",
  "count": 5,
  "entries": [
    {
      "id": "abc123",
      "textInput": "Water plants",
      "category": "home",
      "priority": "normal",
      "entryType": "fixed",
      "recurrence": {
        "type": "weekly",
        "value": [1, 4]
      },
      "createdAt": "2026-05-15T10:00:00Z",
      "addedByEmail": "user@example.com"
    }
  ]
}
```

#### Example: Home Automation Usage

```python
import json
from datetime import datetime

# Read exported file
with open('/tmp/husk_fixed_entries.json') as f:
    data = json.load(f)

# Filter for today's entries
today = datetime.now()
weekday = today.weekday()  # 0=Monday, 6=Sunday
day = today.day
date_str = today.strftime('%m-%d')

for entry in data['entries']:
    rec = entry.get('recurrence', {})
    rec_type = rec.get('type')
    
    matches = False
    if rec_type == 'daily':
        matches = True
    elif rec_type == 'weekly' and weekday in rec.get('value', []):
        matches = True
    elif rec_type == 'monthly' and day == rec.get('value'):
        matches = True
    elif rec_type == 'yearly' and date_str == rec.get('value'):
        matches = True
    
    if matches:
        print(f"Reminder: {entry['textInput']}")
```
