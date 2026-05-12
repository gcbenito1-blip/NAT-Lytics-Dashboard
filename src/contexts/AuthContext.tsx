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
  ) => Promise<{ error: Error | null; user?: UserProfile }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; user?: UserProfile }>;
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

    // Add session storage to detect tab close
    const handleTabClose = () => {
      // Optional: Clear sensitive data from sessionStorage
      sessionStorage.clear();
    };

    window.addEventListener('beforeunload', handleTabClose);

    // Check if this is a new session
    if (!sessionStorage.getItem('session_active')) {
      sessionStorage.setItem('session_active', 'true');
      // Optional: Sign out if this is a new session and you want fresh login each time
      // firebaseSignOut(auth);
    }

    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', handleTabClose);
    };
  }, []);

  async function signUp(
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ): Promise<{ error: Error | null; user?: UserProfile }> {
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

      // Return the user profile so login component can use it immediately
      return { error: null, user: profile };
    } catch (error) {
      console.error('Sign up error:', error);
      return { error: error as Error };
    }
  }

  async function signIn(
    email: string,
    password: string
  ): Promise<{ error: Error | null; user?: UserProfile }> {
    try {
      // First, sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Immediately fetch the user profile after successful sign in
      const profile = await getUserProfile(userCredential.user.uid);

      // Update the context state
      setUser(profile);

      // Return the profile so the component can use it immediately
      return { error: null, user: profile };
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: error as Error };
    }
  }

  async function signOut(): Promise<void> {
    await firebaseSignOut(auth);
    setUser(null); // Clear user state immediately
  }

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Helper: Fetch user profile from Firestore ─────────────────────────────────

async function getUserProfile(uid: string): Promise<UserProfile> {
  try {
    const snap = await getDoc(doc(db, USERS_COLLECTION, uid));

    if (!snap.exists()) {
      console.warn(`No user profile found for UID: ${uid}`);
      // If the profile doesn't exist yet, return a minimal profile
      const firebaseUser = auth.currentUser;
      const displayName = firebaseUser?.displayName || '';
      const nameParts = displayName.split(' ');

      return {
        id: uid,
        email: firebaseUser?.email ?? '',
        role: 'researcher',
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        name: displayName,
      };
    }

    const data = snap.data();
    return {
      id: data.id || uid,
      email: data.email || '',
      role: data.role || 'researcher',
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      name: data.name || '',
    } as UserProfile;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}