import { useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { checkAuth, ApiError } from "../lib/dataClient";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      setAccessDenied(false);
    });
  }, []);

  // ログイン直後に許可リスト内かどうかをサーバーへ確認する。
  // 403のみを「アクセス権なし」として扱い、それ以外(ネットワークエラー等)は無視する。
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    void (async () => {
      try {
        await checkAuth();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setAccessDenied(true);
          await signOut(auth);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const signIn = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signOutUser = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, accessDenied, signIn, signOutUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}
