import { app } from './firebase-config.js';
import { auth } from './auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

const db = getFirestore(app);

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

export async function getDocuments() {
  return withFirestoreAuthRetry(async () => {
    const q = query(collection(db, 'documents'), orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
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
      addedByUid: user.uid,
      addedByEmail: user.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
}

export async function updateDocument(id, { title, content }) {
  const updates = { updatedAt: serverTimestamp() };
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;
  return withFirestoreAuthRetry(() => updateDoc(doc(db, 'documents', id), updates));
}

export async function deleteDocument(id) {
  return withFirestoreAuthRetry(() => deleteDoc(doc(db, 'documents', id)));
}
