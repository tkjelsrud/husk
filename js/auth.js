import { app } from './firebase-config.js';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';

export const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const authSetup = setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error('Failed to enable local auth persistence', err);
});
let authReadyPromise = null;

async function loadRuntimeConfig() {
  try {
    const mod = await import('./runtime-config.js');
    return mod.runtimeConfig || {};
  } catch {
    return {};
  }
}

function redirectToIndex(reason = '') {
  const url = new URL('index.html', window.location.href);
  if (reason) url.searchParams.set('reason', reason);
  window.location.href = url.toString();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export async function isAuthorizedUser(user) {
  if (!user?.email) return false;
  const runtimeConfig = await loadRuntimeConfig();
  const allowedEmails = Array.isArray(runtimeConfig.allowedEmails)
    ? runtimeConfig.allowedEmails.map(normalizeEmail).filter(Boolean)
    : [];

  if (allowedEmails.length === 0) return false;
  return allowedEmails.includes(normalizeEmail(user.email));
}

export async function finalizeLoginRedirect() {
  await authSetup;
  return getRedirectResult(auth);
}

export async function loginWithGoogle() {
  await authSetup;
  return signInWithPopup(auth, provider);
}

export async function loginWithGoogleRedirect() {
  await authSetup;
  return signInWithRedirect(auth, provider);
}

export function logout(reason = '') {
  return signOut(auth).finally(() => {
    redirectToIndex(reason);
  });
}

export async function waitForAuthReady() {
  await authSetup;

  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      }, (err) => {
        console.error('Failed while restoring auth state', err);
        unsubscribe();
        resolve(null);
      });
    });
  }

  return authReadyPromise;
}

export function requireAuth(initFn) {
  let initialized = false;
  let currentUid = null;

  function initIfNeeded(user) {
    if (currentUid === user.uid) return;
    currentUid = user.uid;
    initFn(user);
  }

  waitForAuthReady().then(async (user) => {
    if (!user) {
      redirectToIndex();
      return;
    }

    if (!await isAuthorizedUser(user)) {
      await logout('unauthorized');
      return;
    }

    initialized = true;
    initIfNeeded(user);
  }).catch((err) => {
    console.error(err);
    redirectToIndex();
  });

  onAuthStateChanged(auth, async (user) => {
    if (!initialized) return;

    if (!user) {
      redirectToIndex();
      return;
    }

    if (!await isAuthorizedUser(user)) {
      await logout('unauthorized');
      return;
    }

    initIfNeeded(user);
  }, (err) => {
    console.error(err);
    redirectToIndex();
  });
}
