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

export async function addEntry(text, user) {
  return addDoc(collection(db, 'entries'), {
    text,
    date: getTodayLocalDate(),
    processed: false,
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

export function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
