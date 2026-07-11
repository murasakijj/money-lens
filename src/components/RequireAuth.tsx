import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, accessDenied } = useAuth();

  if (loading) {
    return <p>読み込み中...</p>;
  }

  if (!user || accessDenied) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
