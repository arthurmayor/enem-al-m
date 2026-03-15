import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import DiagnosticIntro from "./pages/DiagnosticIntro";
import DiagnosticTest from "./pages/DiagnosticTest";
import DiagnosticLoading from "./pages/DiagnosticLoading";
import DiagnosticResults from "./pages/DiagnosticResults";
import AiTutor from "./pages/AiTutor";
import Performance from "./pages/Performance";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
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
            <Route path="/study" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/exams" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/mission/:type/:id" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
