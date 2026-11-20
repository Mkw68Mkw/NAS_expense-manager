import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { ArrowLeftRight, BarChart3, LayoutDashboard, Menu, Moon, Settings, Sun, Tags, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transaktionen", label: "Transaktionen", icon: ArrowLeftRight },
  { to: "/kategorien", label: "Kategorien", icon: Tags },
  { to: "/berichte", label: "Berichte", icon: BarChart3 },
  { to: "/einstellungen", label: "Einstellungen", icon: Settings },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg shadow-sm">
        <TrendingUp className="size-4.5" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">Expense Manager</p>
        <p className="text-muted-foreground text-xs">Persönliche Finanzen</p>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Hauptnavigation" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Helles Design aktivieren" : "Dunkles Design aktivieren"}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <aside className="bg-sidebar fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 border-r p-4 lg:flex">
        <Brand />
        <NavItems />
        <div className="text-muted-foreground mt-auto flex items-center justify-between px-2 text-xs">
          <span>Währung: CHF</span>
          <ThemeToggle />
        </div>
      </aside>

      <header className="bg-background/80 sticky top-0 z-40 flex h-14 items-center justify-between border-b px-4 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Navigation öffnen">
          <Menu />
        </Button>
        <Brand />
        <ThemeToggle />
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent aria-describedby={undefined} className="gap-6 p-4">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Brand />
          <NavItems onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
