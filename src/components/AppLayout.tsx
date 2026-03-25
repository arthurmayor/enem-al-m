import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, BookOpen, FileText, BarChart3, Sparkles, Trophy, Menu, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { to: "/dashboard", icon: Home, label: "Dashboard" },
  { to: "/study", icon: BookOpen, label: "Estudar" },
  { to: "/exams", icon: FileText, label: "Simulados" },
  { to: "/desempenho", icon: BarChart3, label: "Performance" },
  { to: "/tutor", icon: Sparkles, label: "Tutor IA" },
  { to: "/ranking", icon: Trophy, label: "Ranking" },
];

interface ProfileSnippet {
  name: string | null;
  total_xp: number;
  current_streak: number;
}

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileSnippet | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("name, total_xp, current_streak")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [user]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const initial = profile?.name?.charAt(0)?.toUpperCase() || "?";

  const sidebarContent = (compact: boolean) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-2 px-4 h-16 border-b border-gray-100 shrink-0 ${compact ? "justify-center px-0" : ""}`}>
        <BookOpen className="h-6 w-6 text-foreground shrink-0" />
        {!compact && <span className="text-lg font-bold text-foreground tracking-tight">Cátedra</span>}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 rounded-xl transition-all duration-200 text-sm font-medium ${
                compact ? "justify-center px-2 py-3" : "px-3 py-2.5"
              } ${
                isActive
                  ? "bg-foreground text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-gray-50"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!compact && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer: profile snippet */}
      {profile && (
        <div className={`border-t border-gray-100 px-3 py-3 shrink-0 ${compact ? "flex justify-center" : ""}`}>
          {compact ? (
            <div className="h-9 w-9 rounded-xl bg-foreground flex items-center justify-center text-white text-sm font-semibold">
              {initial}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-foreground flex items-center justify-center text-white text-sm font-semibold shrink-0">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{profile.name || "Estudante"}</p>
                <p className="text-[10px] text-muted-foreground">
                  {profile.total_xp || 0} XP · {profile.current_streak || 0}🔥
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar (lg: full, md: compact) */}
      <aside className="hidden md:flex lg:w-60 md:w-16 bg-white border-r border-gray-100 fixed top-0 left-0 h-screen z-40 flex-col">
        {/* lg: full sidebar */}
        <div className="hidden lg:flex flex-col h-full">
          {sidebarContent(false)}
        </div>
        {/* md: compact sidebar (icons only) */}
        <div className="flex lg:hidden flex-col h-full">
          {sidebarContent(true)}
        </div>
      </aside>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 h-10 w-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-foreground shadow-sm"
        aria-label="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
          <aside className="absolute top-0 left-0 w-64 h-full bg-white shadow-xl flex flex-col">
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-3 right-3 h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent(false)}
          </aside>
        </div>
      )}

      {/* Main content area */}
      <main className="flex-1 md:ml-16 lg:ml-60 min-h-screen">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
