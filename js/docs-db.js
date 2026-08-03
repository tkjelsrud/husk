import { auth } from './auth.js';
import { db } from './firestore.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

export function isFirestoreAuthError(err) {
  const code = String(err?.code || '');
  return code === 'permission-denied' || code === 'unauthenticated';
}

async function withFirestoreAuthRetry(operation) {
  try {
    return await operation();
  } catch (err) {
    if (!isFirestoreAuthError(err) || !auth.currentUser) throw err;
    await auth.currentUser.getIdToken(true);
    return operation();
  }
}

export function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export async function getDocuments() {
  return withFirestoreAuthRetry(async () => {
    const q = query(collection(db, 'documents'), orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Active writings on top, archived beneath; each group newest-first.
    docs.sort((a, b) => {
      const archived = (a.archived ? 1 : 0) - (b.archived ? 1 : 0);
      if (archived) return archived;
      return timestampMillis(b.updatedAt) - timestampMillis(a.updatedAt);
    });
    return docs;
  });
}

export async function getDocument(id) {
  return withFirestoreAuthRetry(async () => {
    const snapshot = await getDoc(doc(db, 'documents', id));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() };
  });
}

export async function addDocument({ title, content }, user) {
  return withFirestoreAuthRetry(() =>
    addDoc(collection(db, 'documents'), {
      title,
      content,
      archived: false,
      addedByUid: user.uid,
      addedByEmail: user.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
}

export async function updateDocument(id, { title, content, archived }) {
  const updates = { updatedAt: serverTimestamp() };
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;
  if (archived !== undefined) updates.archived = archived;
  return withFirestoreAuthRetry(() => updateDoc(doc(db, 'documents', id), updates));
}

export async function deleteDocument(id) {
  return withFirestoreAuthRetry(() => deleteDoc(doc(db, 'documents', id)));
}
