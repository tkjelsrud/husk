import { app } from './firebase-config.js';
import {
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';

export const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

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
  return getRedirectResult(auth);
}

export async function loginWithGoogle() {
  return signInWithPopup(auth, provider);
}

export function logout(reason = '') {
  return signOut(auth).finally(() => {
    redirectToIndex(reason);
  });
}

export function requireAuth(initFn) {
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
  }, (err) => {
    console.error(err);
    redirectToIndex();
    });
}
