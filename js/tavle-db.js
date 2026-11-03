import { auth } from './auth.js';
import { db } from './firestore.js';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

// The board ("Tavle") is a single shared canvas. Every text box on it is its
// own document in the `tavle` collection, so two people editing different
// boxes never overwrite each other.
const COLLECTION = 'tavle';

function isAuthError(err) {
  const code = String(err?.code || '');
  return code === 'permission-denied' || code === 'unauthenticated';
}

async function withAuthRetry(operation) {
  try {
    return await operation();
  } catch (err) {
    if (!isAuthError(err) || !auth.currentUser) throw err;
    await auth.currentUser.getIdToken(true);
    return operation();
  }
}

export function subscribeNotes(onChange, onError) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snapshot) => onChange(snapshot.docChanges().map((change) => ({
      type: change.type,
      id: change.doc.id,
      hasPendingWrites: change.doc.metadata.hasPendingWrites,
      ...change.doc.data(),
    }))),
    onError,
  );
}

// Ids are generated client-side so the page knows a box's id before the write
// lands — otherwise the local snapshot echo would arrive as an unknown box.
export function newNoteId() {
  return doc(collection(db, COLLECTION)).id;
}

export async function createNote(id, { text, x, y }, user) {
  return withAuthRetry(() =>
    setDoc(doc(db, COLLECTION, id), {
      text,
      x: Math.round(x),
      y: Math.round(y),
      addedByUid: user.uid,
      addedByEmail: user.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
}

// Lines live in the same collection, marked with kind: 'line'.
export async function createLine(id, { orientation, x, y, length }, user) {
  return withAuthRetry(() =>
    setDoc(doc(db, COLLECTION, id), {
      kind: 'line',
      text: '',
      orientation,
      length: Math.round(length),
      x: Math.round(x),
      y: Math.round(y),
      addedByUid: user.uid,
      addedByEmail: user.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
}

export async function updateNote(id, { text, x, y }) {
  const updates = { updatedAt: serverTimestamp() };
  if (text !== undefined) updates.text = text;
  if (x !== undefined) updates.x = Math.round(x);
  if (y !== undefined) updates.y = Math.round(y);
  return withAuthRetry(() => updateDoc(doc(db, COLLECTION, id), updates));
}

export async function deleteNote(id) {
  return withAuthRetry(() => deleteDoc(doc(db, COLLECTION, id)));
}
