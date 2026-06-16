import { app } from './firebase-config.js';
import { initializeFirestore } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

// Single shared Firestore instance for the whole app.
//
// Safari (and some restrictive networks) block Firestore's streaming
// WebChannel — "Fetch API cannot load … /Listen/channel … due to access
// control checks" — which intermittently left reads resolving with no data
// (e.g. an empty note list right after navigating). experimentalAutoDetectLongPolling
// makes the SDK fall back to long polling automatically, which is robust there.
//
// initializeFirestore must run before any getFirestore(app) call, so every
// module imports `db` from here instead of calling getFirestore itself.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
