# Husk

Small private Firebase web app for a shared input queue.

This is a plain static site. There is no bundler, framework, or npm-based app runtime.

## What it does

- Google login with a small allowlist
- persistent browser session via Firebase local auth persistence
- one protected input form for 1 to 5 lines of text plus category
- each saved record gets a server timestamp, `priority: normal`, `processed: false`, and empty due date
- separate read-only listing page for all submitted entries

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
