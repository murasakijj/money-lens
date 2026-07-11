import { createContext } from "react";
import type { User } from "firebase/auth";

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  accessDenied: boolean;
  authError: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
  retryAuthorization: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
