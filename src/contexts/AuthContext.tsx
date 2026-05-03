import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface UserProfile {
  uid: string;
  email: string;
  role: 'teacher' | 'admin' | 'researcher';
  firstName: string;
  lastName: string;
  name: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Simple local storage based auth
const USERS_KEY = 'app_users';
const CURRENT_USER_KEY = 'current_user';

function getStoredUsers(): Record<string, { password: string; profile: UserProfile }> {
  const data = localStorage.getItem(USERS_KEY);
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveStoredUsers(users: Record<string, { password: string; profile: UserProfile }>): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const storedUserId = localStorage.getItem(CURRENT_USER_KEY);
    if (storedUserId) {
      const users = getStoredUsers();
      const userData = users[storedUserId];
      if (userData) {
        setUser(userData.profile);
      }
    }
    setLoading(false);
  }, []);

  async function signUp(email: string, password: string, firstName: string, lastName: string) {
    try {
      const users = getStoredUsers();

      // Check if user already exists
      if (users[email]) {
        return { error: new Error('User already exists') };
      }

      const uid = generateId();
      const profileData: UserProfile = {
        uid,
        email,
        firstName,
        lastName,
        role: 'researcher',
        name: `${firstName} ${lastName}`,
      };

      // Store user credentials and profile
      users[email] = { password, profile: profileData };
      saveStoredUsers(users);

      // Set current user
      localStorage.setItem(CURRENT_USER_KEY, email);
      setUser(profileData);

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const users = getStoredUsers();
      const userData = users[email];

      if (!userData || userData.password !== password) {
        return { error: new Error('Invalid email or password') };
      }

      // Set current user
      localStorage.setItem(CURRENT_USER_KEY, email);
      setUser(userData.profile);

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  async function signOut() {
    localStorage.removeItem(CURRENT_USER_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
