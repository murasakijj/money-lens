import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { checkAuth, clearDataCache, ApiError } from "../lib/dataClient";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [authError, setAuthError] = useState(false);

  const authorize = useCallback(async () => {
    setLoading(true);
    setAuthError(false);
    try {
      await checkAuth();
      setLoading(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setAccessDenied(true);
        await signOut(auth);
        return;
      }
      if (err instanceof ApiError && err.status === 401) {
        await signOut(auth);
        return;
      }
      setAuthError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        void authorize();
      } else {
        clearDataCache();
        setLoading(false);
      }
    });
  }, [authorize]);

  const signIn = async () => {
    setAccessDenied(false);
    setAuthError(false);
    await signInWithPopup(auth, googleProvider);
  };

  const signOutUser = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        accessDenied,
        authError,
        signIn,
        signOutUser,
        retryAuthorization: authorize,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
