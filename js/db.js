import { app } from './firebase-config.js';
import { auth } from './auth.js';
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

export function isFirestoreAuthError(err) {
  const code = String(err?.code || '');
  return code === 'permission-denied' || code === 'unauthenticated';
}

async function withFirestoreAuthRetry(operation) {
  try {
    return await operation();
  } catch (err) {
    if (!isFirestoreAuthError(err) || !auth.currentUser) {
      throw err;
    }

    await auth.currentUser.getIdToken(true);
    return operation();
  }
}

export const ENTRY_CATEGORIES = [
  'unknown',
  'work',
  'creative',
  'houseproj',
  'family',
  'general',
  'huskmcp',
  'axiom'
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
  return withFirestoreAuthRetry(async () => {
    const entries = await getRegularEntriesForOrdering();
    const maxActiveSortOrder = entries
      .filter((entry) => entry.done !== true)
      .reduce((maxOrder, entry) => Math.max(maxOrder, entry.sortOrder || 0), 0);

    // Entries with an explicit non-family category need no backend processing.
    // family needs backend for calendar sync; unknown needs backend for AI classification.
    const needsBackend = !category || category === 'unknown' || category === 'family';

    return addDoc(collection(db, 'entries'), {
      textInput,
      category,
      priority: 'normal',
      processed: !needsBackend,
      done: false,
      dueDate: null,
      entryType: 'regular',
      addedByUid: user.uid,
      addedByEmail: user.email || '',
      createdAt: serverTimestamp(),
      sortOrder: maxActiveSortOrder + SORT_ORDER_STEP
    });
  });
}

export async function getEntries() {
  return withFirestoreAuthRetry(() => getRegularEntriesForOrdering());
}

export async function getFixedEntries() {
  return withFirestoreAuthRetry(async () => {
    const entryQuery = query(
      collection(db, 'entries'),
      where('entryType', '==', 'fixed')
    );
    const snapshot = await getDocs(entryQuery);
    const entries = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    return entries.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  });
}

export async function deleteEntry(entryId) {
  return withFirestoreAuthRetry(() => deleteDoc(doc(db, 'entries', entryId)));
}

export async function updateEntry(entryId, { textInput, category }) {
  return withFirestoreAuthRetry(() => updateDoc(doc(db, 'entries', entryId), {
    textInput,
    category
  }));
}

export async function markEntryDone(entryId) {
  return withFirestoreAuthRetry(async () => {
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
  });
}

export async function markEntryNotDone(entryId) {
  return withFirestoreAuthRetry(async () => {
    const entries = await getRegularEntriesForOrdering();
    const maxActiveSortOrder = entries
      .filter((entry) => entry.id !== entryId && entry.done !== true)
      .reduce((maxOrder, entry) => Math.max(maxOrder, entry.sortOrder || 0), 0);

    return updateDoc(doc(db, 'entries', entryId), {
      done: false,
      sortOrder: maxActiveSortOrder + SORT_ORDER_STEP
    });
  });
}

export async function saveRegularEntriesOrder(orderedEntryIds) {
  return withFirestoreAuthRetry(async () => {
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
  });
}

export async function addFixedEntry({ textInput, category, recurrence }, user) {
  return withFirestoreAuthRetry(() => addDoc(collection(db, 'entries'), {
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
  }));
}

export async function updateFixedEntry(entryId, { textInput, category, recurrence }) {
  return withFirestoreAuthRetry(() => updateDoc(doc(db, 'entries', entryId), {
    textInput,
    category,
    recurrence: recurrence || { type: 'none' }
  }));
}
