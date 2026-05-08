import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

// Define UserProfile locally since we removed sessions.ts
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

const USERS_COLLECTION = 'users';

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        // Fetch user profile from Firestore
        const profile = await getUserProfile(firebaseUser.uid);
        setUser(profile);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  async function signUp(
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ): Promise<{ error: Error | null }> {
    try {
      // Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // Build profile
      const userId = cred.user.uid;
      const profile: UserProfile = {
        id: userId,
        email: email.toLowerCase().trim(),
        role: 'researcher',
        firstName,
        lastName,
        name: `${firstName} ${lastName}`.trim(),
      };

      // Update Firebase display name
      await updateProfile(cred.user, { displayName: profile.name });

      // Save profile to Firestore
      await setDoc(doc(db, USERS_COLLECTION, userId), {
        ...profile,
        createdAt: serverTimestamp(),
        email: profile.email,
      });

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
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  async function signOut(): Promise<void> {
    await firebaseSignOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Helper: Fetch user profile from Firestore ─────────────────────────────────

async function getUserProfile(uid: string): Promise<UserProfile> {
  const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
  if (!snap.exists()) {
    throw new Error('User profile not found');
  }
  const data = snap.data();
  return {
    id: data.id,
    email: data.email,
    role: data.role,
    firstName: data.firstName,
    lastName: data.lastName,
    name: data.name,
  } as UserProfile;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
