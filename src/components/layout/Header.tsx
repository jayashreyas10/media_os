"use client";

import { useState } from "react";
import { Search, Plus, Sparkles, Menu, X, User } from "lucide-react";
import { CommandCenterModal } from "./CommandCenterModal";

export function Header({ onMobileMenuToggle }: { onMobileMenuToggle?: () => void }) {
  const [commandCenterOpen, setCommandCenterOpen] = useState(false);

  return (
    <>
      <header className="h-14 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-30">
        {/* Left: Mobile Toggle & Brand Indicator */}
        <div className="flex items-center gap-3">
          {onMobileMenuToggle && (
            <button
              onClick={onMobileMenuToggle}
              className="md:hidden p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800"
              aria-label="Toggle Navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider hidden sm:inline">
              Active Brand:
            </span>
            <span className="text-xs font-medium text-zinc-200 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              TechOperator Media
            </span>
          </div>
        </div>

        {/* Center/Right: Command Center Trigger & Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setCommandCenterOpen(true)}
            className="flex items-center gap-2 bg-zinc-900/90 hover:bg-zinc-800/90 text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-md border border-zinc-800 text-xs transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Command Center...</span>
            <span className="hidden sm:inline text-[10px] font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 border border-zinc-700">
              Ctrl+K
            </span>
          </button>

          <a
            href="/campaigns"
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">New Campaign</span>
          </a>

          <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 text-xs font-medium ml-1">
            AV
          </div>
        </div>
      </header>

      {/* Global Command Center */}
      <CommandCenterModal
        isOpen={commandCenterOpen}
        onClose={() => setCommandCenterOpen(false)}
      />
    </>
  );
}
