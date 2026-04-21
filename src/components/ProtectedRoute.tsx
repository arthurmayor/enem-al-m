import { useState, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { DEV_SKIP_AUTH } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// Module-level cache survives component unmounts
const profileCache: { userId: string | null; onboardingComplete: boolean | null } = {
  userId: null,
  onboardingComplete: null,
};

const DevBanner = () => (
  <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white text-center text-xs font-semibold py-1 tracking-wide">
    MODO TESTE — Autenticação desativada
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(
    user && profileCache.userId === user.id ? profileCache.onboardingComplete : null
  );
  const [profileLoading, setProfileLoading] = useState(
    !(user && profileCache.userId === user.id)
  );

  useEffect(() => {
    if (!user) {
      setOnboardingComplete(null);
      setProfileLoading(false);
      return;
    }
    if (profileCache.userId === user.id) {
      setOnboardingComplete(profileCache.onboardingComplete);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    let cancelled = false;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_complete")
        .eq("id", user.id)
        .single();
      if (!cancelled) {
        const val = data?.onboarding_complete ?? false;
        profileCache.userId = user.id;
        profileCache.onboardingComplete = val;
        setOnboardingComplete(val);
        setProfileLoading(false);
      }
    };
    fetchProfile();
    return () => { cancelled = true; };
  }, [user]);

  if (DEV_SKIP_AUTH) {
    return (
      <>
        <DevBanner />
        <div className="pt-6">{children}</div>
      </>
    );
  }

  // === AUTH REAL ===
  if (loading || (user && profileLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const currentPath = location.pathname;
  const isOnboardingRoute = currentPath === "/onboarding";
  const isDiagnosticRoute = currentPath.startsWith("/diagnostic");

  // Onboarding not complete → redirect to /onboarding (unless already there or on diagnostic)
  if (!onboardingComplete && !isOnboardingRoute && !isDiagnosticRoute) {
    return <Navigate to="/onboarding" replace />;
  }

  // Onboarding complete → redirect away from /onboarding
  if (onboardingComplete && isOnboardingRoute) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
