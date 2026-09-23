import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { User, AuthResponse } from "@acme/shared";
import { api, setUnauthorizedHandler } from "./api";
import { queryClient } from "./queryClient";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (response: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("auth_token"),
  );
  const [isLoading, setIsLoading] = useState(!!token);

  // Ends the session: forget the token, the user, and every cached response so
  // nothing from this session leaks to whoever signs in next.
  const endSession = useCallback(() => {
    localStorage.removeItem("auth_token");
    queryClient.clear();
    setToken(null);
    setUser(null);
  }, []);

  // Any authenticated request that gets a 401 (expired token, API restarted
  // with a new secret) ends the session, but only if the rejected token is
  // still the stored one: a stale response for an old token must not sign
  // out a user who logged in after that request started.
  useEffect(() => {
    setUnauthorizedHandler((rejectedToken) => {
      if (localStorage.getItem("auth_token") === rejectedToken) endSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    // Ignore the result if the token changed while /auth/me was in flight.
    let current = true;
    api
      .get<User>("/auth/me")
      .then((u) => {
        if (current) setUser(u);
      })
      // A 401 is handled by the unauthorized handler above.
      .catch(() => {})
      .finally(() => {
        if (current) setIsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [token]);

  const login = useCallback((response: AuthResponse) => {
    localStorage.setItem("auth_token", response.token);
    // A new user must never see the previous user's cached data.
    queryClient.clear();
    setToken(response.token);
    setUser(response.user);
  }, []);

  const logout = endSession;

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
