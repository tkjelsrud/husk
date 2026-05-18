import { app } from './firebase-config.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';
import { assignSequentialSortOrders, compareEntries, hasSortOrder, SORT_ORDER_STEP, sortEntries } from './lib/entry-order.js';

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

async function fetchRegularEntries() {
  const snapshot = await getDocs(query(collection(db, 'entries')));
  const entries = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

  return entries.filter((entry) => !entry.entryType || entry.entryType === 'regular');
}

async function ensureRegularEntriesHaveSortOrder(entries) {
  if (entries.length === 0 || entries.every(hasSortOrder)) {
    return sortEntries(entries);
  }

  const normalizedEntries = assignSequentialSortOrders(sortEntries(entries));
  const batch = writeBatch(db);

  normalizedEntries.forEach((entry) => {
    batch.update(doc(db, 'entries', entry.id), { sortOrder: entry.sortOrder });
  });

  await batch.commit();
  return normalizedEntries;
}

async function getRegularEntriesForOrdering() {
  const entries = await fetchRegularEntries();
  return ensureRegularEntriesHaveSortOrder(entries);
}

export async function addEntry({ textInput, category }, user) {
  const entries = await getRegularEntriesForOrdering();
  const maxActiveSortOrder = entries
    .filter((entry) => entry.done !== true)
    .reduce((maxOrder, entry) => Math.max(maxOrder, entry.sortOrder || 0), 0);

  return addDoc(collection(db, 'entries'), {
    textInput,
    category,
    priority: 'normal',
    processed: false,
    done: false,
    dueDate: null,
    entryType: 'regular',
    addedByUid: user.uid,
    addedByEmail: user.email || '',
    createdAt: serverTimestamp(),
    sortOrder: maxActiveSortOrder + SORT_ORDER_STEP
  });
}

export async function getEntries() {
  return getRegularEntriesForOrdering();
}

export async function getFixedEntries() {
  const entryQuery = query(
    collection(db, 'entries'),
    where('entryType', '==', 'fixed')
  );
  const snapshot = await getDocs(entryQuery);
  const entries = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  // Sort by createdAt in JavaScript (descending - newest first)
  return entries.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return bTime - aTime;
  });
}

export async function deleteEntry(entryId) {
  return deleteDoc(doc(db, 'entries', entryId));
}

export async function updateEntry(entryId, { textInput, category }) {
  return updateDoc(doc(db, 'entries', entryId), { 
    textInput, 
    category 
  });
}

export async function markEntryDone(entryId) {
  const entries = await getRegularEntriesForOrdering();
  const lowestActiveSortOrder = entries
    .filter((entry) => entry.id !== entryId && entry.done !== true)
    .reduce((lowestOrder, entry) => Math.min(lowestOrder, entry.sortOrder), Infinity);
  const nextSortOrder = Number.isFinite(lowestActiveSortOrder)
    ? lowestActiveSortOrder - 1
    : 0;

  return updateDoc(doc(db, 'entries', entryId), { 
    done: true, 
    sortOrder: nextSortOrder
  });
}

export async function markEntryNotDone(entryId) {
  const entries = await getRegularEntriesForOrdering();
  const maxActiveSortOrder = entries
    .filter((entry) => entry.id !== entryId && entry.done !== true)
    .reduce((maxOrder, entry) => Math.max(maxOrder, entry.sortOrder || 0), 0);

  return updateDoc(doc(db, 'entries', entryId), { 
    done: false, 
    sortOrder: maxActiveSortOrder + SORT_ORDER_STEP
  });
}

export async function saveRegularEntriesOrder(orderedEntryIds) {
  const entries = await getRegularEntriesForOrdering();
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const remainingEntries = entries.filter((entry) => !orderedEntryIds.includes(entry.id));
  const orderedEntries = orderedEntryIds
    .map((entryId) => entriesById.get(entryId))
    .filter(Boolean);
  const normalizedEntries = assignSequentialSortOrders([
    ...orderedEntries,
    ...sortEntries(remainingEntries)
  ]);
  const batch = writeBatch(db);

  normalizedEntries.forEach((entry) => {
    batch.update(doc(db, 'entries', entry.id), { sortOrder: entry.sortOrder });
  });

  await batch.commit();
}

export async function addFixedEntry({ textInput, category, recurrence }, user) {
  return addDoc(collection(db, 'entries'), {
    textInput,
    category,
    entryType: 'fixed',
    recurrence: recurrence || { type: 'none' },
    priority: 'normal',
    processed: false,
    done: false,
    dueDate: null,
    addedByUid: user.uid,
    addedByEmail: user.email || '',
    createdAt: serverTimestamp()
  });
}

export async function updateFixedEntry(entryId, { textInput, category, recurrence }) {
  return updateDoc(doc(db, 'entries', entryId), { 
    textInput, 
    category,
    recurrence: recurrence || { type: 'none' }
  });
}
