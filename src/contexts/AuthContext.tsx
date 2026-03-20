import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

// ⚠️ MUDAR PARA false ANTES DO DEPLOY
export const DEV_SKIP_AUTH = false;

const FAKE_USER = {
  id: "test-user-00000000-0000-0000-0000-000000000000",
  email: "teste@catedra.com",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: { name: "Usuário Teste" },
  created_at: new Date().toISOString(),
} as unknown as User;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(DEV_SKIP_AUTH ? FAKE_USER : null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(DEV_SKIP_AUTH ? false : true);

  useEffect(() => {
    if (DEV_SKIP_AUTH) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, name: string) => {
    if (DEV_SKIP_AUTH) return { error: null, needsEmailConfirmation: false };
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { name },
      },
    });
    if (error) return { error: error as Error | null };
    const { data: { session: newSession } } = await supabase.auth.getSession();
    if (newSession?.user) {
      await supabase.from("profiles").upsert({
        id: newSession.user.id,
        name,
        onboarding_complete: false,
      });
    }
    return { error: null, needsEmailConfirmation: !newSession };
  };

  const signIn = async (email: string, password: string) => {
    if (DEV_SKIP_AUTH) return { error: null };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    if (DEV_SKIP_AUTH) return;
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    if (DEV_SKIP_AUTH) return { error: null };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    // Fallback for HMR/hot-reload edge cases
    if (DEV_SKIP_AUTH) {
      return {
        user: FAKE_USER,
        session: null,
        loading: false,
        signUp: async () => ({ error: null, needsEmailConfirmation: false }),
        signIn: async () => ({ error: null }),
        signOut: async () => {},
        resetPassword: async () => ({ error: null }),
      } as AuthContextType;
    }
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
