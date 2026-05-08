import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface UserProfile {
  id: string;
  email: string;
  role: 'teacher' | 'admin' | 'researcher';
  firstName: string;
  lastName: string;
  name: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USERS_KEY = 'nat-lytics-users';
const CURRENT_USER_KEY = 'nat-lytics-current-user';

function getUsers(): Record<string, { password: string; profile: UserProfile }> {
  try {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveUsers(users: Record<string, { password: string; profile: UserProfile }>): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getCurrentUserId(): string | null {
  return localStorage.getItem(CURRENT_USER_KEY);
}

function setCurrentUserId(userId: string | null): void {
  if (userId) {
    localStorage.setItem(CURRENT_USER_KEY, userId);
  } else {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = getCurrentUserId();
    if (userId) {
      const users = getUsers();
      // Find the user entry by profile.id (users is keyed by email)
      const userEntry = Object.values(users).find(u => u.profile.id === userId);
      if (userEntry) {
        setUser(userEntry.profile);
      } else {
        setCurrentUserId(null);
      }
    }
    setLoading(false);
  }, []);

  async function signUp(
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ): Promise<{ error: Error | null }> {
    try {
      const users = getUsers();
      const normalizedEmail = email.toLowerCase().trim();

      if (users[normalizedEmail]) {
        return { error: new Error('User already exists') };
      }

      const userId = generateId();
      const profile: UserProfile = {
        id: userId,
        email: normalizedEmail,
        role: 'researcher',
        firstName,
        lastName,
        name: `${firstName} ${lastName}`.trim(),
      };

      users[normalizedEmail] = { password, profile };
      saveUsers(users);
      setCurrentUserId(userId);
      setUser(profile);

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  async function signIn(
    email: string,
    password: string
  ): Promise<{ error: Error | null }> {
    try {
      const users = getUsers();
      const normalizedEmail = email.toLowerCase().trim();
      const stored = users[normalizedEmail];

      if (!stored || stored.password !== password) {
        return { error: new Error('Invalid email or password') };
      }

      setCurrentUserId(stored.profile.id);
      setUser(stored.profile);

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  async function signOut(): Promise<void> {
    setCurrentUserId(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
