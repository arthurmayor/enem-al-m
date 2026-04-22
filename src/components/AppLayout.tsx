import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, BookOpen, FileText, BarChart3, Sparkles, Trophy, Menu, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { to: "/dashboard", icon: Home, label: "Dashboard" },
  { to: "/study", icon: BookOpen, label: "Estudar" },
  { to: "/exams", icon: FileText, label: "Simulados" },
  { to: "/desempenho", icon: BarChart3, label: "Desempenho" },
  { to: "/tutor", icon: Sparkles, label: "Tutor IA" },
  { to: "/ranking", icon: Trophy, label: "Ranking" },
];

interface ProfileSnippet {
  name: string | null;
  total_xp: number;
  current_streak: number;
  exam_config_id: string | null;
}

interface ExamConfigSnippet {
  exam_name: string | null;
  course_name: string | null;
}

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileSnippet | null>(null);
  const [examConfig, setExamConfig] = useState<ExamConfigSnippet | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("name, total_xp, current_streak, exam_config_id")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          if (data.exam_config_id) {
            supabase
              .from("exam_configs")
              .select("exam_name, course_name")
              .eq("id", data.exam_config_id)
              .single()
              .then(({ data: ec }) => {
                if (ec) setExamConfig(ec);
              });
          }
        }
      });
  }, [user]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const initial = profile?.name?.charAt(0)?.toUpperCase() || "?";
  const currentNavItem =
    navItems.find(
      (item) =>
        location.pathname === item.to ||
        location.pathname.startsWith(`${item.to}/`),
    ) ?? navItems[0];

  const sidebarFull = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 p-6 shrink-0">
        <BookOpen className="h-6 w-6 text-ink-strong shrink-0" />
        <span className="text-xl font-semibold text-ink-strong tracking-tight">Cátedra</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 rounded-lg transition-all duration-200 text-sm px-3 py-2.5 ${
                isActive
                  ? "bg-bg-app text-ink-strong font-semibold border-l-[3px] border-brand-500"
                  : "text-ink-soft font-medium hover:bg-bg-app hover:text-ink-strong"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer: profile snippet */}
      {profile && (
        <div className="mt-auto border-t border-line-light px-3 pt-3 pb-3 shrink-0">
          <NavLink
            to="/perfil"
            className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-bg-app cursor-pointer"
          >
            <div className="h-9 w-9 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-strong truncate">{profile.name || "Estudante"}</p>
              <p className="text-xs text-ink-soft">
                🔥 {profile.current_streak || 0} dias · ⚡ {profile.total_xp || 0} XP
              </p>
              {examConfig && (examConfig.exam_name || examConfig.course_name) && (
                <p className="text-xs text-ink-muted truncate">
                  {[examConfig.exam_name, examConfig.course_name].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </NavLink>
        </div>
      )}
    </div>
  );

  const sidebarCompact = () => (
    <div className="flex flex-col h-full items-center">
      {/* Logo icon */}
      <div className="flex items-center justify-center h-16 shrink-0">
        <BookOpen className="h-6 w-6 text-ink-strong" />
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 space-y-0.5 w-full">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={`flex items-center justify-center rounded-lg transition-all duration-200 px-2 py-3 ${
                isActive
                  ? "bg-bg-app text-ink-strong border-l-[3px] border-brand-500"
                  : "text-ink-soft hover:bg-bg-app hover:text-ink-strong"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
            </NavLink>
          );
        })}
      </nav>

      {/* Footer: avatar only */}
      {profile && (
        <div className="mt-auto border-t border-line-light py-3 shrink-0 flex justify-center w-full">
          <NavLink
            to="/perfil"
            title="Perfil"
            className="h-8 w-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-semibold hover:opacity-80 transition-opacity"
          >
            {initial}
          </NavLink>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar (lg: full, md: compact) */}
      <aside className="hidden md:flex bg-white border-r border-line-light fixed top-0 left-0 h-screen z-40 flex-col lg:w-[var(--sidebar-width)] md:w-[var(--sidebar-compact)]">
        {/* lg: full sidebar */}
        <div className="hidden lg:flex flex-col h-full">
          {sidebarFull()}
        </div>
        {/* md: compact sidebar (icons only) */}
        <div className="flex lg:hidden flex-col h-full">
          {sidebarCompact()}
        </div>
      </aside>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 h-10 w-10 rounded-lg bg-white border border-line-light flex items-center justify-center text-ink-strong shadow-card"
        aria-label="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
          <aside className="absolute top-0 left-0 w-[var(--sidebar-width)] h-full bg-white shadow-xl flex flex-col">
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-4 h-8 w-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink-strong"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarFull()}
          </aside>
        </div>
      )}

      {/* Main content area */}
      <main className="flex-1 md:ml-[var(--sidebar-compact)] lg:ml-[var(--sidebar-width)] min-h-screen bg-bg-app">
        <div className="p-4 md:p-6 lg:p-8 max-w-[var(--content-max)] mx-auto">
          <div className="sticky top-0 z-30 -mx-4 mb-5 border-b border-border bg-background/95 px-4 pb-3 pt-14 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0">
            <div className="mb-3 flex items-center gap-3 md:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <currentNavItem.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Páginas
                </p>
                <h2 className="text-base font-semibold text-foreground">
                  {currentNavItem.label}
                </h2>
              </div>
            </div>

            <nav
              aria-label="Navegação das páginas"
              className="flex gap-2 overflow-x-auto pb-1"
            >
              {navItems.map((item) => {
                const isActive =
                  location.pathname === item.to ||
                  location.pathname.startsWith(`${item.to}/`);

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={`inline-flex min-w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
