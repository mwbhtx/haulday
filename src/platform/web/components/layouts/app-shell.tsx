"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RouteIcon, ClipboardList, BarChart3, Settings, Shield, LogOut } from "lucide-react";
import { cn } from "@/core/utils";
import { useAuth } from "@/core/services/auth-provider";
import { Button } from "@/platform/web/components/ui/button";

const navItems = [
  { href: "/routes", label: "Routes", icon: RouteIcon },
  { href: "/orders", label: "Board", icon: ClipboardList },
  { href: "/dashboard", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

const adminNavItems = [
  { href: "/admin", label: "Admin", icon: Shield },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const allNavItems =
    user?.role === "admin"
      ? [...navItems, ...adminNavItems]
      : navItems;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top nav bar */}
      <header className="flex h-14 shrink-0 items-center border-b bg-sidebar px-4">
        {/* Logo */}
        <Link href="/routes" className="font-display text-3xl text-sidebar-foreground tracking-wide">
          HAULVISOR
        </Link>

        {/* Desktop nav */}
        <nav className="ml-8 flex items-center gap-1">
          {allNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[#161616] text-sidebar-foreground"
                    : "text-sidebar-foreground/50 hover:bg-white/10 hover:text-sidebar-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User section */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-sidebar-foreground/70">
            {user?.email || user?.username || "Guest"}
          </span>
          <Button
            variant="default"
            size="sm"
            onClick={logout}
            title="Log out"
            className="gap-1.5"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-xs">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
