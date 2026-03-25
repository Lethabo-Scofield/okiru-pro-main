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
  organizationName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
  twofaEnabled: boolean;
  lastLogin: string | null;
}

interface RegisterData {
  username: string;
  password: string;
  fullName?: string;
  email?: string;
  organizationId?: string;
  organizationName?: string;
  subscriptionId?: string;
  role?: string;
}

interface TwoFAResponse {
  requires2FA: true;
  message: string;
  emailHint: string;
}

interface LoginResult {
  user?: AuthUser;
  requires2FA?: boolean;
  message?: string;
  emailHint?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  verifyOtp: (otp: string) => Promise<void>;
  resendOtp: () => Promise<string>;
  toggle2FA: (enabled: boolean) => Promise<{ requiresVerification?: boolean; message: string }>;
  confirm2FA: (otp: string) => Promise<void>;
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

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error('Network error. Please try again.');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || 'Invalid username or password');
    }
    const data = await res.json().catch(() => null);

    if (data?.requires2FA) {
      return { requires2FA: true, message: data.message, emailHint: data.emailHint };
    }

    if (!data?.user) {
      throw new Error('Login failed. Please try again.');
    }
    setUser(data.user);
    queryClient.clear();
    return { user: data.user };
  }, [queryClient]);

  const verifyOtp = useCallback(async (otp: string) => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ otp }),
      });
    } catch {
      throw new Error('Network error. Please try again.');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || 'Verification failed');
    }
    const data = await res.json().catch(() => null);
    if (!data?.user) throw new Error('Verification failed.');
    setUser(data.user);
    queryClient.clear();
  }, [queryClient]);

  const resendOtp = useCallback(async (): Promise<string> => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } catch {
      throw new Error('Network error. Please try again.');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || 'Failed to resend code');
    return data?.message || 'Code resent';
  }, []);

  const toggle2FA = useCallback(async (enabled: boolean) => {
    const res = await fetch(`${API_BASE}/api/auth/toggle-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || 'Failed to update 2FA');
    if (data?.user) setUser(data.user);
    return { requiresVerification: data?.requiresVerification, message: data?.message || '' };
  }, []);

  const confirm2FA = useCallback(async (otp: string) => {
    const res = await fetch(`${API_BASE}/api/auth/confirm-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ otp }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || 'Verification failed');
    if (data?.user) setUser(data.user);
  }, []);

  const register = useCallback(async (regData: RegisterData): Promise<{ requiresVerification?: boolean; message?: string; emailHint?: string }> => {
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
    if (result?.requiresVerification) {
      return { requiresVerification: true, message: result.message, emailHint: result.emailHint };
    }
    if (result?.user) {
      setUser(result.user);
    }
    return {};
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
    <AuthContext.Provider value={{
      user, isLoading, login, register, logout,
      verifyOtp, resendOtp, toggle2FA, confirm2FA,
      updateProfile, uploadProfilePicture,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
