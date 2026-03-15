import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

// Lazy-loaded pages — each becomes its own chunk
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DiagnosticIntro = lazy(() => import("./pages/DiagnosticIntro"));
const DiagnosticTest = lazy(() => import("./pages/DiagnosticTest"));
const DiagnosticLoading = lazy(() => import("./pages/DiagnosticLoading"));
const DiagnosticResults = lazy(() => import("./pages/DiagnosticResults"));
const AiTutor = lazy(() => import("./pages/AiTutor"));
const Performance = lazy(() => import("./pages/Performance"));
const Profile = lazy(() => import("./pages/Profile"));
const Study = lazy(() => import("./pages/Study"));
const Exams = lazy(() => import("./pages/Exams"));
const MissionPage = lazy(() => import("./pages/MissionPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/registro" element={<Register />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/diagnostic/intro" element={<ProtectedRoute><DiagnosticIntro /></ProtectedRoute>} />
              <Route path="/diagnostic/test" element={<ProtectedRoute><DiagnosticTest /></ProtectedRoute>} />
              <Route path="/diagnostic/loading" element={<ProtectedRoute><DiagnosticLoading /></ProtectedRoute>} />
              <Route path="/diagnostic/results" element={<ProtectedRoute><DiagnosticResults /></ProtectedRoute>} />
              <Route path="/tutor" element={<ProtectedRoute><AiTutor /></ProtectedRoute>} />
              <Route path="/desempenho" element={<ProtectedRoute><Performance /></ProtectedRoute>} />
              <Route path="/perfil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/study" element={<ProtectedRoute><Study /></ProtectedRoute>} />
              <Route path="/exams" element={<ProtectedRoute><Exams /></ProtectedRoute>} />
              <Route path="/mission/:type/:id" element={<ProtectedRoute><MissionPage /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
