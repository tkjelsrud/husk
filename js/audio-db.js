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
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js';

const db = getFirestore(app);
const storage = getStorage(app);

export const MAX_AUDIO_BYTES = 30 * 1024 * 1024; // 30 MB

// Map file extension -> a sensible audio MIME type, used when the browser
// leaves File.type empty (common for .wav on some platforms).
const EXT_MIME = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
};

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

function fileExtension(file) {
  const name = String(file?.name || '');
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function resolveContentType(file) {
  // Prefer the browser-reported type only when it's already an audio type;
  // otherwise derive an audio/* type from the extension so the Storage rules
  // (which require contentType audio/*) accept the upload.
  if (file?.type && file.type.startsWith('audio/')) return file.type;
  return EXT_MIME[fileExtension(file)] || file?.type || 'application/octet-stream';
}

export function getAudioNotes() {
  return withFirestoreAuthRetry(async () => {
    const q = query(collection(db, 'audionotes'), orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

export function getAudioNote(id) {
  return withFirestoreAuthRetry(async () => {
    const snapshot = await getDoc(doc(db, 'audionotes', id));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() };
  });
}

// Uploads the raw audio file to Cloud Storage under the user's own folder and
// returns the stored path + a stable download URL. Kept separate from the
// Firestore write so the page can show upload progress before the note exists.
export async function uploadAudioFile(file, user) {
  const ext = fileExtension(file) || 'bin';
  const contentType = resolveContentType(file);
  const path = `audionotes/${user.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file, { contentType });
  const url = await getDownloadURL(fileRef);
  return { audioPath: path, audioUrl: url, mimeType: contentType };
}

export function addAudioNote({ title, text, audioPath, audioUrl, mimeType, source }, user) {
  return withFirestoreAuthRetry(() =>
    addDoc(collection(db, 'audionotes'), {
      title,
      text: text || '',
      audioPath,
      audioUrl,
      mimeType: mimeType || '',
      source: source || 'upload',
      addedByUid: user.uid,
      addedByEmail: user.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
}

// Only the text/title is editable after creation; the audio file is immutable
// (replace by deleting and re-uploading) to keep the storage/rules model simple.
export function updateAudioNote(id, { title, text }) {
  const updates = { updatedAt: serverTimestamp() };
  if (title !== undefined) updates.title = title;
  if (text !== undefined) updates.text = text;
  return withFirestoreAuthRetry(() => updateDoc(doc(db, 'audionotes', id), updates));
}

export async function deleteAudioNote(id, audioPath) {
  if (audioPath) {
    // The stored object may already be gone; never let that block the doc delete.
    await deleteObject(storageRef(storage, audioPath)).catch(() => {});
  }
  return withFirestoreAuthRetry(() => deleteDoc(doc(db, 'audionotes', id)));
}
