// sessions.ts — localStorage-backed session management

export interface UserProfile {
  id: string;
  email: string;
  role: 'teacher' | 'admin' | 'researcher';
  firstName: string;
  lastName: string;
  name: string;
}

export interface Session {
  id: string;
  name: string;
  created_at: string;
  user_id: string;
  user_email?: string;
  file_name?: string;
  analysis_summary?: Record<string, unknown>;
  predictions?: unknown;
  feature_importance?: unknown;
  total_predictions?: number;
  average_score?: number;
}

const SESSIONS_KEY = 'nat-lytics-sessions';

function getSessionsStorage(): Session[] {
  try {
    const data = localStorage.getItem(SESSIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveSessionsStorage(sessions: Session[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ─── Auth helper ────────────────────────────────────────────────────────────────

// Pass current user ID from AuthContext
function getCurrentUserId(): string | null {
  try {
    // Access global auth state if available
    const authState = (window as any).__CURRENT_USER_ID__;
    return authState || null;
  } catch {
    return null;
  }
}

// Set global user ID for sessions module (call from App/ProtectedRoute)
export function setCurrentUserId(userId: string | null): void {
  if (userId) {
    (window as any).__CURRENT_USER_ID__ = userId;
  } else {
    delete (window as any).__CURRENT_USER_ID__;
  }
}

// ─── Read ──────────────────────────────────────────────────────────────────────

/** Fetch all sessions belonging to the current user, newest first. */
export async function getSessions(): Promise<Session[]> {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error('You must be signed in to manage sessions.');
  }

  const sessions = getSessionsStorage();
  return sessions
    .filter((s) => s.user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/** Fetch a single session by ID. Returns null if not found or not owned by user. */
export async function getSession(sessionId: string): Promise<Session | null> {
  const userId = getCurrentUserId();
  const sessions = getSessionsStorage();
  const session = sessions.find((s) => s.id === sessionId && s.user_id === userId);
  return session || null;
}

// ─── Create ────────────────────────────────────────────────────────────────────

/** Create a new session for the current user. */
export async function createSession(name: string): Promise<Session> {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error('You must be signed in to create sessions.');
  }

  const sessions = getSessionsStorage();
  const newSession: Session = {
    id: generateId(),
    name,
    user_id: userId,
    created_at: new Date().toISOString(),
  };

  sessions.push(newSession);
  saveSessionsStorage(sessions);

  return newSession;
}

// ─── Update ────────────────────────────────────────────────────────────────────

/** Update arbitrary fields on an owned session. */
export async function updateSession(
  sessionId: string,
  updates: Partial<Omit<Session, 'id' | 'user_id' | 'created_at'>>
): Promise<Session> {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error('You must be signed in to update sessions.');
  }

  const sessions = getSessionsStorage();
  const index = sessions.findIndex((s) => s.id === sessionId && s.user_id === userId);

  if (index === -1) {
    throw new Error('Session not found or unauthorized.');
  }

  sessions[index] = { ...sessions[index], ...updates };
  saveSessionsStorage(sessions);

  return sessions[index];
}

// ─── Delete ────────────────────────────────────────────────────────────────────

/** Delete an owned session by ID. */
export async function deleteSession(sessionId: string): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error('You must be signed in to delete sessions.');
  }

  const sessions = getSessionsStorage();
  const filtered = sessions.filter((s) => !(s.id === sessionId && s.user_id === userId));

  if (sessions.length === filtered.length) {
    throw new Error('Session not found or unauthorized.');
  }

  saveSessionsStorage(filtered);
}

// ─── Predictions helper ────────────────────────────────────────────────────────

/** Save prediction results into a session, computing totals automatically. */
export async function savePredictions(
  sessionId: string,
  predictions: { prediction: number }[],
  fileName?: string
): Promise<Session> {
  const scores = predictions.map((p) => p.prediction).filter((s) => !isNaN(s));
  const averageScore =
    scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

  const updates: Partial<Session> = {
    predictions,
    total_predictions: predictions.length,
    average_score: averageScore,
  };

  if (fileName) updates.file_name = fileName;

  return updateSession(sessionId, updates);
}
