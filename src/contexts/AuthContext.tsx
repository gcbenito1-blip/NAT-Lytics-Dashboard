import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export interface UserProfile {
  id: string;
  email: string;
  role: 'teacher' | 'admin' | 'researcher';
  firstName: string;
  lastName: string;
  name: string;
  schoolId: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    role?: 'teacher' | 'admin' | 'researcher',
    organizationId?: string
  ) => Promise<{ error: Error | null; user?: UserProfile }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; user?: UserProfile }>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error: Error | null }>;
  updateSchoolId: (newSchoolId: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const USERS_COLLECTION = 'users';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const profile = await getUserProfile(firebaseUser.uid);
        setUser(profile);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    const handleTabClose = () => { sessionStorage.clear(); };
    window.addEventListener('beforeunload', handleTabClose);
    if (!sessionStorage.getItem('session_active')) {
      sessionStorage.setItem('session_active', 'true');
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
    lastName: string,
    role: 'teacher' | 'admin' | 'researcher' = 'admin',
    schoolId: string = ''
  ): Promise<{ error: Error | null; user?: UserProfile }> {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const userId = cred.user.uid;

      const profile: UserProfile = {
        id: userId,
        email: email.toLowerCase().trim(),
        role,
        firstName,
        lastName,
        name: `${firstName} ${lastName}`.trim(),
        schoolId,
      };

      await updateProfile(cred.user, { displayName: profile.name });
      await setDoc(doc(db, USERS_COLLECTION, userId), {
        ...profile,
        createdAt: serverTimestamp(),
      });

      return { error: null, user: profile };
    } catch (error) {
      return { error: error as Error };
    }
  }

  async function signIn(
    email: string,
    password: string
  ): Promise<{ error: Error | null; user?: UserProfile }> {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const profile = await getUserProfile(cred.user.uid);
      setUser(profile);
      return { error: null, user: profile };
    } catch (error) {
      return { error: error as Error };
    }
  }

  async function signOut(): Promise<void> {
    await firebaseSignOut(auth);
    setUser(null);
  }

  async function updateSchoolId(newSchoolId: string): Promise<{ error: Error | null }> {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      return { error: new Error('No authenticated user found.') };
    }
    try {
      if (user?.role === 'admin') {
        const usersRef = collection(db, USERS_COLLECTION);
        const q = query(usersRef, where('schoolId', '==', newSchoolId));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          return { error: new Error('This School ID is already taken. Please use a unique School ID.') };
        }
      }

      const profile = { ...user, schoolId: newSchoolId } as UserProfile;
      await setDoc(doc(db, USERS_COLLECTION, firebaseUser.uid), {
        ...profile,
        updatedAt: serverTimestamp(),
      });
      setUser(profile);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  async function changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ error: Error | null }> {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser?.email) {
      return { error: new Error('No authenticated user found.') };
    }
    try {
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut, changePassword, updateSchoolId }}>
      {children}
    </AuthContext.Provider>
  );
}

export async function checkSchoolIdExists(schoolId: string): Promise<boolean> {
  const usersRef = collection(db, USERS_COLLECTION);
  const q = query(usersRef, where('schoolId', '==', schoolId));
  const querySnapshot = await getDocs(q);
  return !querySnapshot.empty;
}

async function getUserProfile(uid: string): Promise<UserProfile> {
  try {
    const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
    if (!snap.exists()) {
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
        schoolId: '',
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
      schoolId: data.schoolId || '',
    } as UserProfile;
  } catch (error) {
    throw error;
  }
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}