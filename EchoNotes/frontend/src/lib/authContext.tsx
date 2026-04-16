import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as auth from './authClient';
import { supabase } from './supabaseClient';

interface AuthState {
  user: { user_id: string } | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function pushRealtimeToken() {
  if (!supabase) return;
  const token = auth.getToken();
  if (token) supabase.realtime.setAuth(token);
}

function clearRealtimeToken() {
  if (!supabase) return;
  supabase.removeAllChannels();
  // setAuth accepts the anon key or an empty string to drop auth claims.
  supabase.realtime.setAuth('');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ user_id: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auth.getMe().then((data) => {
      setUser(data);
      setLoading(false);
      if (data) pushRealtimeToken();
    });
  }, []);

  const signIn = async (email: string, password: string) => {
    const data = await auth.login(email, password);
    setUser({ user_id: data.user_id });
    pushRealtimeToken();
  };

  const signUp = async (email: string, password: string) => {
    const data = await auth.signup(email, password);
    setUser({ user_id: data.user_id });
    pushRealtimeToken();
  };

  const signOut = async () => {
    await auth.logout();
    setUser(null);
    clearRealtimeToken();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
