import { app } from './firebase-config.js';
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

const db = getFirestore(app);

export const ENTRY_CATEGORIES = [
  'unknown',
  'work',
  'creative',
  'houseproj',
  'family',
  'general'
];

export async function addEntry({ textInput, category }, user) {
  return addDoc(collection(db, 'entries'), {
    textInput,
    category,
    processed: false,
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
