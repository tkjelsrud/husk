import { app } from './firebase-config.js';
import { initializeFirestore } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

// Single shared Firestore instance for the whole app.
//
// Safari (and some restrictive networks) block Firestore's streaming
// WebChannel — "Fetch API cannot load … /Listen/channel … due to access
// control checks" — which left reads resolving with no data (empty note list).
// experimentalAutoDetectLongPolling still attempts a WebSocket probe first and
// can return empty results during the transition. Force long polling from the
// start to skip the probe entirely and avoid the CORS error.
//
// initializeFirestore must run before any getFirestore(app) call, so every
// module imports `db` from here instead of calling getFirestore itself.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
