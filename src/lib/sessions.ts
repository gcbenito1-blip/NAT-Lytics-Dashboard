// Session management using localStorage

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

// Get all sessions for a user
export async function getSessions(userId: string): Promise<Session[]> {
    const sessions = getSessionsFromStorage();
    // Filter by user_id and sort by created_at descending
    const userSessions = sessions
        .filter(session => session.user_id === userId)
        .sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateB - dateA;
        });
    return userSessions;
}

// Get sessions by user email
export function getSessionsByEmail(userEmail: string): Session[] {
    const sessions = getSessionsFromStorage();
    // Filter by user_email and sort by created_at descending
    const userSessions = sessions
        .filter(session => session.user_email === userEmail)
        .sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateB - dateA;
        });
    return userSessions;
}

// Get a single session
export async function getSession(sessionId: string): Promise<Session | null> {
    const sessions = getSessionsFromStorage();
    return sessions.find(s => s.id === sessionId) || null;
}

// Create a new session
export async function createSession(userId: string, name: string, userEmail?: string): Promise<Session> {
    const sessions = getSessionsFromStorage();

    const newSession: Session = {
        id: generateId(),
        name,
        created_at: new Date().toISOString(),
        user_id: userId,
        user_email: userEmail,
    };

    sessions.push(newSession);
    saveSessionsToStorage(sessions);

    return newSession;
}

// Update a session
export async function updateSession(sessionId: string, updates: Partial<Session>): Promise<Session | null> {
    const sessions = getSessionsFromStorage();
    const index = sessions.findIndex(s => s.id === sessionId);

    if (index === -1) {
        return null;
    }

    const updatedSession = { ...sessions[index], ...updates };
    sessions[index] = updatedSession;
    saveSessionsToStorage(sessions);

    return updatedSession;
}

// Delete a session
export async function deleteSession(sessionId: string): Promise<boolean> {
    const sessions = getSessionsFromStorage();
    const filteredSessions = sessions.filter(s => s.id !== sessionId);
    saveSessionsToStorage(filteredSessions);
    return true;
}

// Save predictions to a session
export async function savePredictions(sessionId: string, predictions: unknown, fileName?: string): Promise<boolean> {
    const predArray = predictions as { prediction: number }[];
    const scores = predArray.map(p => p.prediction).filter(s => !isNaN(s));
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const updateData: Record<string, unknown> = {
        predictions,
        total_predictions: predArray.length,
        average_score: avgScore,
    };

    if (fileName) {
        updateData.file_name = fileName;
    }

    return (await updateSession(sessionId, updateData as Partial<Session>)) !== null;
}

// Sync versions - now use localStorage
export function getSessionsSync(userId: string): Session[] {
    const sessions = getSessionsFromStorage();
    return sessions
        .filter(session => session.user_id === userId)
        .sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateB - dateA;
        });
}

export function getSessionSync(sessionId: string): Session | null {
    const sessions = getSessionsFromStorage();
    return sessions.find(s => s.id === sessionId) || null;
}

export function createSessionSync(userId: string, name: string): Session {
    const sessions = getSessionsFromStorage();

    const newSession: Session = {
        id: generateId(),
        name,
        created_at: new Date().toISOString(),
        user_id: userId,
    };

    sessions.push(newSession);
    saveSessionsToStorage(sessions);

    return newSession;
}

export function updateSessionSync(sessionId: string, updates: Partial<Session>): Session | null {
    const sessions = getSessionsFromStorage();
    const index = sessions.findIndex(s => s.id === sessionId);

    if (index === -1) {
        return null;
    }

    const updatedSession = { ...sessions[index], ...updates };
    sessions[index] = updatedSession;
    saveSessionsToStorage(sessions);

    return updatedSession;
}

export function deleteSessionSync(sessionId: string): boolean {
    const sessions = getSessionsFromStorage();
    const filteredSessions = sessions.filter(s => s.id !== sessionId);
    saveSessionsToStorage(filteredSessions);
    return true;
}

export function savePredictionsSync(sessionId: string, predictions: unknown, fileName?: string): boolean {
    const predArray = predictions as { prediction: number }[];
    const scores = predArray.map(p => p.prediction).filter(s => !isNaN(s));
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const updateData: Record<string, unknown> = {
        predictions,
        total_predictions: predArray.length,
        average_score: avgScore,
    };

    if (fileName) {
        updateData.file_name = fileName;
    }

    const result = updateSessionSync(sessionId, updateData as Partial<Session>);
    return result !== null;
}

// Helper functions
function getSessionsFromStorage(): Session[] {
    const data = localStorage.getItem('sessions');
    if (!data) return [];
    try {
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function saveSessionsToStorage(sessions: Session[]): void {
    localStorage.setItem('sessions', JSON.stringify(sessions));
}

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
