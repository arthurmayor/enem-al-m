import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { DEV_SKIP_AUTH } from "@/contexts/AuthContext";

const DevBanner = () => (
  <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white text-center text-xs font-semibold py-1 tracking-wide">
    MODO TESTE — Autenticação desativada
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (DEV_SKIP_AUTH) {
    return (
      <>
        <DevBanner />
        <div className="pt-6">{children}</div>
      </>
    );
  }

  // === AUTH REAL (reativar mudando DEV_SKIP_AUTH para false) ===
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
