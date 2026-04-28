import { app } from './firebase-config.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

const db = getFirestore(app);

export const ENTRY_CATEGORIES = [
  'unknown',
  'work',
  'creative',
  'houseproj',
  'family',
  'general',
  'huskmcp'
];

export const ENTRY_PRIORITIES = [
  'low',
  'normal',
  'high'
];

export async function addEntry({ textInput, category }, user) {
  return addDoc(collection(db, 'entries'), {
    textInput,
    category,
    priority: 'normal',
    processed: false,
    done: false,
    dueDate: null,
    addedByUid: user.uid,
    addedByEmail: user.email || '',
    createdAt: serverTimestamp()
  });
}

export async function getEntries() {
  const entryQuery = query(collection(db, 'entries'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(entryQuery);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function deleteEntry(entryId) {
  return deleteDoc(doc(db, 'entries', entryId));
}

export async function updateEntry(entryId, { textInput, category }) {
  return updateDoc(doc(db, 'entries', entryId), { textInput, category });
}

export async function markEntryDone(entryId) {
  return updateDoc(doc(db, 'entries', entryId), { done: true });
}
