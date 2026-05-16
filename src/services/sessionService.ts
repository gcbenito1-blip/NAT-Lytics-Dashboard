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

// ---------------------------------------------------------------------------
// Firestore collection reference
// ---------------------------------------------------------------------------

const SESSIONS_COL = 'sessions';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create a new session — saves to both Firestore and localStorage. */
export async function createSession(
  params: Omit<PredictionSession, 'id' | 'createdAt' | 'updatedAt'>
): Promise<PredictionSession> {
  const id = `${params.teacherId}_${Date.now()}`;
  const now = new Date().toISOString();

  const session: PredictionSession = { ...params, id, createdAt: now, updatedAt: now };

  // ── Firestore ──
  try {
    await setDoc(doc(db, SESSIONS_COL, id), {
      ...session,
      predictions: JSON.stringify(session.predictions), // store as string to avoid Firestore size limits
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('Firestore createSession failed, continuing with localStorage only', e);
  }

  // ── localStorage ──
  const existing = lsGetAll(params.teacherId);
  lsSave(params.teacherId, [session, ...existing]);

  return session;
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

/** Delete a session. */
export async function deleteSession(teacherId: string, sessionId: string): Promise<void> {
  // ── Firestore ──
  try {
    await deleteDoc(doc(db, SESSIONS_COL, sessionId));
  } catch (e) {
    console.warn('Firestore deleteSession failed', e);
  }

  // ── localStorage ──
  const sessions = lsGetAll(teacherId).filter((s) => s.id !== sessionId);
  lsSave(teacherId, sessions);
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

    // IMPORTANT: keep firestoreSessions empty so we don't mix/pretend we fetched remotely
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
