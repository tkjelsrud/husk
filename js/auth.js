import { app } from './firebase-config.js';
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';

export const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const persistenceReady = setPersistence(auth, browserLocalPersistence);

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

function shouldFallbackToRedirect(err) {
  const code = String(err?.code || '');
  return code === 'auth/popup-blocked'
    || code === 'auth/cancelled-popup-request'
    || code === 'auth/operation-not-supported-in-this-environment';
}

export async function finalizeLoginRedirect() {
  await persistenceReady;
  return getRedirectResult(auth);
}

export async function loginWithGoogle() {
  await persistenceReady;

  try {
    return await signInWithPopup(auth, provider);
  } catch (err) {
    if (!shouldFallbackToRedirect(err)) {
      throw err;
    }

    await signInWithRedirect(auth, provider);
    return { redirected: true };
  }
}

export function logout(reason = '') {
  return signOut(auth).finally(() => {
    redirectToIndex(reason);
  });
}

export function requireAuth(initFn) {
  persistenceReady
    .then(() => {
      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          redirectToIndex();
          return;
        }

        if (!await isAuthorizedUser(user)) {
          await logout('unauthorized');
          return;
        }

        initFn(user);
      });
    })
    .catch((err) => {
      console.error(err);
      redirectToIndex();
    });
}
