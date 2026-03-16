import { Link, useLocation } from "react-router-dom";
import { Home, BookOpen, FileText, BarChart3, Trophy } from "lucide-react";

const navItems = [
  { to: "/dashboard", icon: Home, label: "Início" },
  { to: "/study", icon: BookOpen, label: "Estudar" },
  { to: "/exams", icon: FileText, label: "Simulados" },
  { to: "/desempenho", icon: BarChart3, label: "Performance" },
  { to: "/ranking", icon: Trophy, label: "Ranking" },
];

const BottomNav = () => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map((item) => {
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-1 px-3 py-2 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
