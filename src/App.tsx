import { lazy, Suspense } from "react";
import { Component, type ReactNode, type ErrorInfo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";

// Retry wrapper for lazy imports — handles stale chunk 404s after deploys
function lazyRetry(factory: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(() =>
    factory().catch((err) => {
      // Retry once after a short delay (new deploy may have invalidated old chunks)
      console.warn("[LazyRetry] chunk load failed, retrying…", err);
      return new Promise<{ default: React.ComponentType<any> }>((resolve) =>
        setTimeout(() => resolve(factory()), 1500)
      );
    })
  );
}

// Lazy-loaded pages — each becomes its own chunk (with retry)
const Landing = lazyRetry(() => import("./pages/Landing"));
const Login = lazyRetry(() => import("./pages/Login"));
const Register = lazyRetry(() => import("./pages/Register"));
const Onboarding = lazyRetry(() => import("./pages/Onboarding"));
const Dashboard = lazyRetry(() => import("./pages/Dashboard"));
const DiagnosticIntro = lazyRetry(() => import("./pages/DiagnosticIntro"));
const DiagnosticTest = lazyRetry(() => import("./pages/DiagnosticTest"));
const DiagnosticLoading = lazyRetry(() => import("./pages/DiagnosticLoading"));
const DiagnosticResults = lazyRetry(() => import("./pages/DiagnosticResults"));
const AiTutor = lazyRetry(() => import("./pages/AiTutor"));
const Performance = lazyRetry(() => import("./pages/Performance"));
const Profile = lazyRetry(() => import("./pages/Profile"));
const Study = lazyRetry(() => import("./pages/Study"));
const Exams = lazyRetry(() => import("./pages/Exams"));
const ExamSession = lazyRetry(() => import("./pages/ExamSession"));
const MissionPage = lazyRetry(() => import("./pages/MissionPage"));
const Ranking = lazyRetry(() => import("./pages/Ranking"));
const NotFound = lazyRetry(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Error Boundary — catches chunk load failures and other runtime errors
interface EBState { hasError: boolean }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError(): EBState { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold text-foreground">Algo deu errado</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Ocorreu um erro ao carregar a página. Isso pode acontecer após uma atualização.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            Recarregar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public / auth / onboarding — no sidebar */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/registro" element={<Register />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/diagnostic/intro" element={<ProtectedRoute><DiagnosticIntro /></ProtectedRoute>} />
              <Route path="/diagnostic/test" element={<ProtectedRoute><DiagnosticTest /></ProtectedRoute>} />
              <Route path="/diagnostic/loading" element={<ProtectedRoute><DiagnosticLoading /></ProtectedRoute>} />
              <Route path="/diagnostic/results" element={<ProtectedRoute><DiagnosticResults /></ProtectedRoute>} />

              {/* App pages — wrapped with AppLayout sidebar */}
              <Route path="/dashboard" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
              <Route path="/study" element={<ProtectedRoute><AppLayout><Study /></AppLayout></ProtectedRoute>} />
              <Route path="/exams" element={<ProtectedRoute><AppLayout><Exams /></AppLayout></ProtectedRoute>} />
              <Route path="/exam/:examId" element={<ProtectedRoute><AppLayout><ExamSession /></AppLayout></ProtectedRoute>} />
              <Route path="/desempenho" element={<ProtectedRoute><AppLayout><Performance /></AppLayout></ProtectedRoute>} />
              <Route path="/tutor" element={<ProtectedRoute><AppLayout><AiTutor /></AppLayout></ProtectedRoute>} />
              <Route path="/perfil" element={<ProtectedRoute><AppLayout><Profile /></AppLayout></ProtectedRoute>} />
              <Route path="/mission/:type/:id" element={<ProtectedRoute><AppLayout><MissionPage /></AppLayout></ProtectedRoute>} />
              <Route path="/ranking" element={<ProtectedRoute><AppLayout><Ranking /></AppLayout></ProtectedRoute>} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ErrorBoundary>
  </QueryClientProvider>
);

export default App;
