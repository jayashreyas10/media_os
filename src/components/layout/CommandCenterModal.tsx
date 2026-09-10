"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  KanbanSquare,
  BrainCircuit,
  Radio,
  FileText,
  Sparkles,
  ShieldCheck,
  History,
  X,
} from "lucide-react";

interface CommandCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandCenterModal({ isOpen, onClose }: CommandCenterProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  // Keyboard shortcut listener: Ctrl+K / Cmd+K / Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onClose(); // toggle or open
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      label: "New Campaign",
      desc: "Initialize a new campaign with discovery signals",
      icon: KanbanSquare,
      action: () => {
        router.push("/campaigns");
        onClose();
      },
    },
    {
      label: "Open Kanban Board",
      desc: "Multi-campaign visual stage pipeline",
      icon: KanbanSquare,
      action: () => {
        router.push("/campaigns/kanban");
        onClose();
      },
    },
    {
      label: "Open Knowledge Base",
      desc: "Search research documents, notes, transcripts, and playbooks",
      icon: FileText,
      action: () => {
        router.push("/knowledge");
        onClose();
      },
    },
    {
      label: "Open Evidence Graph",
      desc: "Explore primary sources, claims, and verified quotations",
      icon: Radio,
      action: () => {
        router.push("/evidence");
        onClose();
      },
    },
    {
      label: "Open Brand Brain",
      desc: "Manage audience profiles, voice rules, and content pillars",
      icon: BrainCircuit,
      action: () => {
        router.push("/brand-brain");
        onClose();
      },
    },
    {
      label: "Execute Mock AI Task",
      desc: "Dispatch Signal Scout, Researcher, or Writer in Mock mode",
      icon: Sparkles,
      action: () => {
        router.push("/tasks");
        onClose();
      },
    },
    {
      label: "Open Task Queue",
      desc: "Inspect queued, running, and completed agent tasks",
      icon: Radio,
      action: () => {
        router.push("/tasks");
        onClose();
      },
    },
    {
      label: "View Audit Log",
      desc: "Inspect append-only record of system events and transitions",
      icon: History,
      action: () => {
        router.push("/audit");
        onClose();
      },
    },
  ];

  const filtered = actions.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase()) ||
    a.desc.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-zinc-800 gap-3">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            placeholder="Type a command or search MediaOS..."
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action List */}
        <div className="p-2 max-h-80 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-500">
              No matching commands found.
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left hover:bg-zinc-800/80 transition-colors group"
                >
                  <div className="p-1.5 rounded bg-zinc-800 group-hover:bg-zinc-700 text-zinc-400 group-hover:text-zinc-200">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-zinc-200 group-hover:text-white">
                      {item.label}
                    </div>
                    <div className="text-xs text-zinc-500">{item.desc}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-800/80 bg-zinc-950/50 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <span>Navigation: Arrow keys & Enter</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
