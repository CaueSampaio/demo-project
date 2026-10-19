import { Link } from "@tanstack/react-router";
import { BicepsFlexed, Dumbbell, History, LogOut, User } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type AppShellUser = { name: string | null; email: string };

type AppShellProps = {
  user: AppShellUser;
  children: ReactNode;
};

/** The four destinations shared by the desktop sidebar and the mobile tabs. */
const navItems = [
  { to: "/current-workout", label: "Current Workout", icon: Dumbbell },
  { to: "/workout-history", label: "Workout History", icon: History },
  { to: "/movements", label: "Movements", icon: BicepsFlexed },
  { to: "/profile", label: "Profile", icon: User },
] as const;

const linkFocusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted";

/**
 * Authenticated layout: a fixed sidebar on `lg`+, a compact top bar plus four
 * bottom tabs below `lg`, and a single scroll container (`<main>`) inside a
 * `h-dvh` frame so long pages stay reachable.
 */
export function AppShell({ user, children }: AppShellProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <a
          href="#main-content"
          className={cn(
            "sr-only focus:not-sr-only",
            "focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}>
          Skip to main content
        </a>

        <nav
          aria-label="Primary"
          className="hidden shrink-0 border-r border-border bg-muted lg:flex lg:w-64 lg:flex-col xl:w-72">
          <div className="flex h-16 items-center px-6">
            <img src="/wordmark.svg" alt="Better Bookkeeping" className="h-6" />
          </div>

          <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
            {navItems.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors",
                  "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                  "data-[status=active]:bg-primary data-[status=active]:text-primary-foreground",
                  linkFocusRing,
                )}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </div>

          <div className="border-t border-border px-3 py-4">
            <div className="flex items-center gap-3 px-2 py-2">
              <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Logged in as</p>
                <p className="truncate text-sm font-medium text-foreground">{user.name || user.email}</p>
                {user.name ? <p className="truncate text-xs text-muted-foreground">{user.email}</p> : null}
              </div>
            </div>
            <a href="/logout" className="mt-1 block">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-3">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Log out
              </Button>
            </a>
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-muted px-4 lg:hidden">
            <img src="/wordmark.svg" alt="Better Bookkeeping" className="h-6" />
            <Link
              to="/profile"
              aria-label="Profile"
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full bg-card text-muted-foreground transition-colors",
                "hover:text-foreground",
                linkFocusRing,
              )}>
              <User className="h-5 w-5" aria-hidden="true" />
            </Link>
          </header>

          <main id="main-content" className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:px-6 md:py-8 lg:px-8 lg:pb-8">{children}</div>
          </main>

          <nav
            aria-label="Mobile"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-muted pb-[env(safe-area-inset-bottom)] lg:hidden">
            <div className="mx-auto flex w-full max-w-6xl items-stretch">
              {navItems.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  activeProps={{ "aria-current": "page" }}
                  className={cn(
                    "group relative flex min-h-11 flex-1 basis-0 flex-col items-center justify-center gap-1 px-2 py-2",
                    "text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                    "data-[status=active]:text-primary",
                    linkFocusRing,
                  )}>
                  <span
                    aria-hidden="true"
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-transparent group-data-[status=active]:bg-accent"
                  />
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </TooltipProvider>
  );
}
