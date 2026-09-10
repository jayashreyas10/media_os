"use client";

import { useEffect, useState } from "react";
import { History, ShieldCheck, Filter, Search, RotateCcw } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  detailsJson: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/audit");
      const json = await res.json();
      if (json.logs) setLogs(json.logs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.entityType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <History className="w-6 h-6 text-blue-500" />
            Append-Only Audit Trail
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Immutable record of all consequential state transitions, agent runs, and editorial modifications.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 font-mono self-start sm:self-auto bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Refresh Trail
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Filter audit logs by action or entity..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:border-zinc-700"
        />
      </div>

      {/* Audit Log Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-xs font-mono text-zinc-500">
            Reading audit stream...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-xs text-zinc-500 font-mono">
            No matching audit logs recorded.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/80">
            {filtered.map((log) => (
              <div
                key={log.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-zinc-800/30 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-blue-400">{log.action}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      {log.entityType}
                    </span>
                  </div>

                  {log.detailsJson && (
                    <div className="text-[11px] text-zinc-400 font-mono">
                      {log.detailsJson}
                    </div>
                  )}

                  <div className="text-[10px] text-zinc-500">
                    Operator: {log.user?.name || "System"} • Entity ID: #{log.entityId?.slice(0, 8) || "N/A"}
                  </div>
                </div>

                <div className="text-[11px] text-zinc-500 font-mono self-start sm:self-auto shrink-0">
                  {formatDateTime(log.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
