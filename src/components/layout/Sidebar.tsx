"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Network,
  KanbanSquare,
  BrainCircuit,
  Cpu,
  History,
  ShieldCheck,
  Radio,
  ExternalLink,
  FileEdit,
  BarChart3,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Signal Scout", href: "/signals", icon: Radio },
  { label: "Campaigns", href: "/campaigns", icon: KanbanSquare },
  { label: "Content Studio", href: "/studio", icon: FileEdit },
  { label: "Editorial Reviews", href: "/reviews", icon: ShieldCheck },
  { label: "Analytics & Learning", href: "/analytics", icon: BarChart3 },
  { label: "Publishing & Channels", href: "/publishing", icon: Globe },
  { label: "Kanban Board", href: "/campaigns/kanban", icon: KanbanSquare },
  { label: "Knowledge Base", href: "/knowledge", icon: BookOpen },
  { label: "Evidence Graph", href: "/evidence", icon: Network },
  { label: "Brand Brain", href: "/brand-brain", icon: BrainCircuit },
  { label: "Task Queue", href: "/tasks", icon: Cpu },
  { label: "Audit Log", href: "/audit", icon: History },
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col justify-between p-4 select-none shrink-0",
        className
      )}
    >
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 py-3 mb-6 border-b border-zinc-800/80">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-base shadow-sm">
            M
          </div>
          <div>
            <div className="font-semibold text-zinc-100 text-sm tracking-tight flex items-center gap-1.5">
              MediaOS <span className="text-[10px] bg-blue-950/80 text-blue-400 border border-blue-800/60 px-1.5 py-0.2 rounded font-mono">v2.0</span>
            </div>
            <div className="text-[11px] text-zinc-400 font-mono">Apex Media Lab</div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-zinc-800/90 text-white font-semibold"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80"
                )}
              >
                <Icon className={cn("w-4 h-4", isActive ? "text-blue-400" : "text-zinc-400")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer System Status Badge */}
      <div className="pt-4 border-t border-zinc-800/80 space-y-3">
        <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-md p-2.5">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Engine Status
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-400 border border-emerald-800/50">
              Mock AI
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Deterministic mock provider active. Zero API costs.
          </p>
        </div>

        <div className="flex items-center justify-between px-1 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" /> Human in the loop
          </span>
          <a
            href="/api/health"
            target="_blank"
            className="hover:text-zinc-300 flex items-center gap-0.5 transition-colors"
          >
            Health <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </aside>
  );
}
