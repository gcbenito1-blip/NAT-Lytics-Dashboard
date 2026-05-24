import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

import type { PredictionResult } from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PredictionSession {
  id: string;
  teacherId: string;
  teacherName: string;
  schoolId: string;
  sessionName: string;
  fileName: string;
  createdAt: string; // ISO string
  updatedAt: string;
  totalPredictions: number;
  averageScore: number;
  passedCount: number;
  predictions: PredictionResult[];

}

export type SessionMeta = Omit<PredictionSession, 'predictions'>;

// ---------------------------------------------------------------------------
// Local-storage helpers
// ---------------------------------------------------------------------------

const LS_KEY = (teacherId: string) => `nat_sessions_${teacherId}`;
const LS_RAW_KEY = (sessionId: string) => `nat_rawdata_${sessionId}`;

export function lsGetAll(teacherId: string): PredictionSession[] {
  try {
    const raw = localStorage.getItem(LS_KEY(teacherId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function lsSave(teacherId: string, sessions: PredictionSession[]) {
  try {
    localStorage.setItem(LS_KEY(teacherId), JSON.stringify(sessions));
  } catch (e) {
    console.warn('localStorage write failed', e);
  }
}

function lsSaveRawData(sessionId: string, rawData: Record<string, unknown>[]) {
  try {
    localStorage.setItem(LS_RAW_KEY(sessionId), JSON.stringify(rawData));
  } catch (e) {
    console.warn('localStorage rawData write failed (may exceed quota)', e);
  }
}

function lsGetRawData(sessionId: string): Record<string, unknown>[] {
  try {
    const raw = localStorage.getItem(LS_RAW_KEY(sessionId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function lsDeleteRawData(sessionId: string) {
  try {
    localStorage.removeItem(LS_RAW_KEY(sessionId));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Firestore collection reference
// ---------------------------------------------------------------------------

const SESSIONS_COL = 'sessions';
const RAW_DATA_SUBCOL = 'rawData';

// How many CSV rows to store per Firestore subcollection document.
// 100 rows keeps each chunk well under the 1 MB document limit even
// for wide schemas (30+ columns).
const RAW_DATA_CHUNK_SIZE = 100;

// ---------------------------------------------------------------------------
// rawData helpers
// ---------------------------------------------------------------------------

/**
 * Saves rawData to a `rawData` subcollection under the session document.
 * Rows are split into chunks so no single document exceeds Firestore's 1 MB limit.
 */
async function saveRawDataToFirestore(
  sessionId: string,
  rawData: Record<string, unknown>[]
): Promise<void> {
  if (!rawData.length) return;

  const writes: Promise<void>[] = [];
  for (let i = 0; i < rawData.length; i += RAW_DATA_CHUNK_SIZE) {
    const chunkIndex = Math.floor(i / RAW_DATA_CHUNK_SIZE);
    const chunkId = `chunk_${String(chunkIndex).padStart(5, '0')}`; // zero-padded for correct sort order
    const chunkRef = doc(db, SESSIONS_COL, sessionId, RAW_DATA_SUBCOL, chunkId);
    writes.push(
      setDoc(chunkRef, { rows: rawData.slice(i, i + RAW_DATA_CHUNK_SIZE) })
    );
  }

  await Promise.all(writes);
}

/**
 * Reads all rawData chunks from Firestore and reassembles them in order.
 */
async function loadRawDataFromFirestore(
  sessionId: string
): Promise<Record<string, unknown>[]> {
  const snap = await getDocs(
    collection(db, SESSIONS_COL, sessionId, RAW_DATA_SUBCOL)
  );

  if (snap.empty) return [];

  const allRows: Record<string, unknown>[] = [];
  snap.docs
    .sort((a, b) => a.id.localeCompare(b.id)) // chunk_00000, chunk_00001, …
    .forEach((d) => {
      const rows = d.data().rows;
      if (Array.isArray(rows)) allRows.push(...rows);
    });

  return allRows;
}

/**
 * Deletes all rawData chunks for a session from Firestore.
 */
async function deleteRawDataFromFirestore(sessionId: string): Promise<void> {
  const snap = await getDocs(
    collection(db, SESSIONS_COL, sessionId, RAW_DATA_SUBCOL)
  );
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create a new session — saves to both Firestore and localStorage. Returns the session ID. */
export async function createSession(
  params: Omit<PredictionSession, 'id' | 'createdAt' | 'updatedAt'> & {
    rawData?: Record<string, unknown>[];
  }
): Promise<string> {  // ← FIXED: Return string ID, not PredictionSession
  const { rawData, ...sessionParams } = params;

  // Use Firestore auto-generated ID for better compatibility
  const docRef = doc(collection(db, SESSIONS_COL));
  const id = docRef.id;
  const now = new Date().toISOString();

  const session: PredictionSession = { ...sessionParams, id, createdAt: now, updatedAt: now };

  // ── Firestore ──
  try {
    await setDoc(docRef, {
      ...session,
      predictions: JSON.stringify(session.predictions), // store as string to avoid Firestore size limits
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Save rawData to subcollection (fire-and-forget — non-critical)
    if (rawData?.length) {
      saveRawDataToFirestore(id, rawData).catch((e) =>
        console.warn('rawData subcollection write failed (non-critical):', e)
      );
    }

    console.log('✅ Session created in Firestore with ID:', id);
  } catch (e) {
    console.warn('Firestore createSession failed, continuing with localStorage only', e);
  }

  // ── localStorage ──
  const existing = lsGetAll(sessionParams.teacherId);
  lsSave(sessionParams.teacherId, [session, ...existing]);

  // Also cache rawData locally so it's available offline / immediately
  if (rawData?.length) {
    lsSaveRawData(id, rawData);
  }

  return id; // ← FIXED: Return just the ID string
}

/** Rename a session. */
export async function renameSession(
  teacherId: string,
  sessionId: string,
  newName: string
): Promise<void> {
  const now = new Date().toISOString();

  // ── Firestore ──
  try {
    await updateDoc(doc(db, SESSIONS_COL, sessionId), {
      sessionName: newName,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('Firestore renameSession failed', e);
  }

  // ── localStorage ──
  const sessions = lsGetAll(teacherId).map((s) =>
    s.id === sessionId ? { ...s, sessionName: newName, updatedAt: now } : s
  );
  lsSave(teacherId, sessions);
}

/** Delete a session (including its rawData subcollection). */
export async function deleteSession(teacherId: string, sessionId: string): Promise<void> {
  // ── Firestore ──
  try {
    // Delete rawData subcollection first, then the session document
    await deleteRawDataFromFirestore(sessionId);
    await deleteDoc(doc(db, SESSIONS_COL, sessionId));
  } catch (e) {
    console.warn('Firestore deleteSession failed', e);
  }

  // ── localStorage ──
  const sessions = lsGetAll(teacherId).filter((s) => s.id !== sessionId);
  lsSave(teacherId, sessions);
  lsDeleteRawData(sessionId);
}

/** Get all sessions for a single teacher. Merges localStorage + Firestore. */
export async function getTeacherSessions(teacherId: string): Promise<PredictionSession[]> {
  let firestoreSessions: PredictionSession[] = [];

  try {
    const q = query(
      collection(db, SESSIONS_COL),
      where('teacherId', '==', teacherId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    firestoreSessions = snap.docs.map((d) => {
      const data = d.data();
      return {
        ...data,
        id: d.id,
        predictions: typeof data.predictions === 'string'
          ? JSON.parse(data.predictions)
          : (data.predictions ?? []),
        createdAt: data.createdAt instanceof Timestamp
          ? data.createdAt.toDate().toISOString()
          : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp
          ? data.updatedAt.toDate().toISOString()
          : data.updatedAt,
      } as PredictionSession;
    });
  } catch (e: any) {
    const currentUid = auth.currentUser?.uid;
    const code = e?.code ?? e?.name;
    const message = e?.message ?? String(e);

    console.warn(
      'Firestore getTeacherSessions failed; falling back to localStorage.',
      {
        teacherId,
        authUid: currentUid,
        errorCode: code,
        errorMessage: message,
      }
    );

    firestoreSessions = [];
  }

  // Merge: Firestore is source of truth; fall back to localStorage for offline items
  const lsSessions = lsGetAll(teacherId);
  const fsIds = new Set(firestoreSessions.map((s) => s.id));
  const lsOnly = lsSessions.filter((s) => !fsIds.has(s.id));

  const merged = [...firestoreSessions, ...lsOnly].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Keep localStorage in sync
  lsSave(teacherId, merged);

  return merged;
}

/** Get all sessions for an entire organization (for admin overview). Returns metadata only. */
export async function getOrgSessions(schoolId: string): Promise<SessionMeta[]> {
  try {
    const q = query(
      collection(db, SESSIONS_COL),
      where('schoolId', '==', schoolId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        teacherId: data.teacherId,
        teacherName: data.teacherName,
        schoolId: data.schoolId,
        sessionName: data.sessionName,
        fileName: data.fileName,
        createdAt: data.createdAt instanceof Timestamp
          ? data.createdAt.toDate().toISOString()
          : data.createdAt ?? new Date().toISOString(),
        updatedAt: data.updatedAt instanceof Timestamp
          ? data.updatedAt.toDate().toISOString()
          : data.updatedAt ?? new Date().toISOString(),
        totalPredictions: data.totalPredictions ?? 0,
        averageScore: data.averageScore ?? 0,
        passedCount: data.passedCount ?? 0,
      } as SessionMeta;
    });
  } catch (e) {
    console.warn('Firestore getOrgSessions failed', e);
    return [];
  }
}

/** Fetch a single session by ID (includes predictions). */
export async function getSessionById(
  teacherId: string,
  sessionId: string
): Promise<PredictionSession | null> {
  // Try Firestore first
  try {
    const snap = await getDoc(doc(db, SESSIONS_COL, sessionId));
    if (snap.exists()) {
      const data = snap.data();
      return {
        ...data,
        id: snap.id,
        predictions: typeof data.predictions === 'string'
          ? JSON.parse(data.predictions)
          : (data.predictions ?? []),
        createdAt: data.createdAt instanceof Timestamp
          ? data.createdAt.toDate().toISOString()
          : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp
          ? data.updatedAt.toDate().toISOString()
          : data.updatedAt,
      } as PredictionSession;
    }
  } catch (e) {
    console.warn('Firestore getSessionById failed', e);
  }

  // Fall back to localStorage
  return lsGetAll(teacherId).find((s) => s.id === sessionId) ?? null;
}

/**
 * Fetch rawData for a session.
 *
 * Resolution order:
 *   1. localStorage cache (instant — set when the session was created)
 *   2. Firestore subcollection (for revisited / cross-device sessions)
 *   3. Empty array (rawData was never saved for this session)
 */
export async function getSessionRawData(
  sessionId: string
): Promise<Record<string, unknown>[]> {
  // 1. Check localStorage cache first (fast path)
  const cached = lsGetRawData(sessionId);
  if (cached.length > 0) return cached;

  // 2. Fetch from Firestore subcollection
  try {
    const rows = await loadRawDataFromFirestore(sessionId);

    // Warm the local cache so subsequent calls are instant
    if (rows.length > 0) lsSaveRawData(sessionId, rows);

    return rows;
  } catch (e) {
    console.warn('Firestore getSessionRawData failed', e);
    return [];
  }
}