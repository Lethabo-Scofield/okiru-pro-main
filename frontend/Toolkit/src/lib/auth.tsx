import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "./config";

interface AuthUser {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string | null;
  organizationId: string | null;
  profilePicture: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: { username: string; password: string; fullName?: string; email?: string; organizationName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { fullName?: string; email?: string }) => Promise<void>;
  uploadProfilePicture: (file: File) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    fetch(`${API_BASE}/api/auth/me`, { credentials: 'include', signal: controller.signal })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => { clearTimeout(timeout); setIsLoading(false); });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
    } catch {
      throw new Error('Network error. Please try again.');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || 'Invalid username or password');
    }
    const data = await res.json().catch(() => null);
    if (!data?.user) {
      throw new Error('Login failed. Please try again.');
    }
    setUser(data.user);
    queryClient.clear();
  }, [queryClient]);

  const register = useCallback(async (regData: { username: string; password: string; fullName?: string; email?: string; organizationName?: string }) => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(regData),
      });
    } catch {
      throw new Error('Network error. Please try again.');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || 'Registration failed');
    }
    const result = await res.json().catch(() => null);
    if (!result?.user) {
      throw new Error('Registration failed. Please try again.');
    }
    setUser(result.user);
    queryClient.clear();
  }, [queryClient]);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const updateProfile = useCallback(async (data: { fullName?: string; email?: string }) => {
    const res = await fetch(`${API_BASE}/api/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update profile');
    const result = await res.json();
    setUser(result.user);
  }, []);

  const uploadProfilePicture = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('picture', file);
    const res = await fetch(`${API_BASE}/api/profile/picture`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload picture');
    const result = await res.json();
    setUser(result.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, updateProfile, uploadProfilePicture }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
