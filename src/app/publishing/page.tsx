"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Globe,
  Youtube,
  Twitter,
  Linkedin,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Lock,
  RefreshCw,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";

interface ConnectedAccountItem {
  id: string;
  platform: string;
  accountName: string;
  accountId: string;
  accountEmail?: string | null;
  metadataJson?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const PLATFORM_ICONS: Record<string, any> = {
  YOUTUBE: Youtube,
  X: Twitter,
  LINKEDIN: Linkedin,
  NEWSLETTER: Mail,
};

const PLATFORM_NAMES: Record<string, string> = {
  YOUTUBE: "YouTube Channel",
  X: "X / Twitter Account",
  LINKEDIN: "LinkedIn Profile / Page",
  NEWSLETTER: "Newsletter Broadcast API",
};

export default function PublishingConsolePage() {
  const [accounts, setAccounts] = useState<ConnectedAccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/publishing/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleConnect = async (platform: string) => {
    try {
      setConnectingPlatform(platform);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch(`/api/oauth/${platform.toLowerCase()}/authorize`);
      const data = await res.json();

      if (!res.ok || !data.authUrl) {
        throw new Error(data.error || "Failed to initiate OAuth authorization");
      }

      // In mock/test environment, simulate instant authorization callback
      const authRes = await fetch(data.authUrl);
      const callbackData = await authRes.json();

      if (!authRes.ok || !callbackData.success) {
        throw new Error(callbackData.error || "OAuth callback completion failed");
      }

      setSuccessMsg(`Successfully connected ${PLATFORM_NAMES[platform] || platform}!`);
      await fetchAccounts();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleRevoke = async (accountId: string, platform: string) => {
    if (!confirm(`Are you sure you want to revoke the connection to ${PLATFORM_NAMES[platform] || platform}? All tokens will be destroyed immediately.`)) {
      return;
    }

    try {
      setRevokingId(accountId);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch(`/api/publishing/accounts/${accountId}/revoke`, {
        method: "POST",
      });

      if (res.ok) {
        setSuccessMsg(`Revoked connection to ${PLATFORM_NAMES[platform] || platform}.`);
        await fetchAccounts();
      } else {
        const data = await res.json();
        throw new Error(data.error || "Failed to revoke account");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Revocation failed");
    } finally {
      setRevokingId(null);
    }
  };

  const handleSync = async (accountId: string, platform: string) => {
    try {
      setSyncingId(accountId);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch("/api/analytics/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to sync channel metrics");
      }

      setSuccessMsg(
        `Synchronized ${PLATFORM_NAMES[platform] || platform}: ${data.syncedSnapshotsCount} snapshot(s) ingested (${data.duplicateSnapshotsCount || 0} duplicate(s) skipped).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncingId(null);
    }
  };

  const platforms = ["YOUTUBE", "X", "LINKEDIN", "NEWSLETTER"];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase bg-blue-950 text-blue-400 border border-blue-800/80 px-2 py-0.5 rounded font-semibold">
              Phase 7
            </span>
            <span className="text-[10px] font-mono uppercase bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded font-semibold">
              AES-256-GCM Encrypted
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1 flex items-center gap-2.5">
            <Globe className="w-6 h-6 text-blue-400" />
            Publishing & Channels Console
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Manage authenticated platform connections, enforce version-bound human publishing gates, and inspect delivery integrity.
          </p>
        </div>

        <button
          onClick={fetchAccounts}
          disabled={loading}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold px-3 py-2 rounded-lg border border-zinc-700 transition-colors flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="bg-red-950/80 border border-red-800 text-red-300 text-xs p-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs p-3 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Security Invariants Banner */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-950/80 border border-blue-800/80 text-blue-400 shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-200">Zero-Token Exposure</h4>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
              Tokens are encrypted at rest with AES-256-GCM. Decryption occurs in-memory strictly at API dispatch.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-purple-950/80 border border-purple-800/80 text-purple-400 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-200">Mandatory Human Gate</h4>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
              AI agents are prohibited from publishing (403 Forbidden). Explicit operator sign-off is required.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-200">Delivery Idempotency</h4>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
              Deterministic cryptographic locks prevent duplicate videos or tweets from being posted twice.
            </p>
          </div>
        </div>
      </div>

      {/* Connected Channels Grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider font-mono">
          Distribution Channels
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {platforms.map((platform) => {
            const Icon = PLATFORM_ICONS[platform] || Globe;
            const connectedAcc = accounts.find((a) => a.platform === platform && a.status === "ACTIVE");
            const isConnecting = connectingPlatform === platform;

            return (
              <div
                key={platform}
                className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-zinc-800/80 border border-zinc-700/80 text-zinc-200">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{PLATFORM_NAMES[platform]}</h3>
                      <p className="text-xs text-zinc-400 font-mono mt-0.5">
                        {connectedAcc ? connectedAcc.accountName : "Not Connected"}
                      </p>
                    </div>
                  </div>

                  {connectedAcc ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-mono uppercase bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Active
                      </span>
                      {(() => {
                        let isMock = true;
                        try {
                          if (connectedAcc.metadataJson) {
                            const parsed = JSON.parse(connectedAcc.metadataJson);
                            if (parsed.isMock === false) isMock = false;
                          }
                        } catch {}
                        return isMock ? (
                          <span className="text-[9px] font-mono uppercase bg-amber-950/80 text-amber-300 border border-amber-800/60 px-1.5 py-0.5 rounded">
                            🧪 Mock / Sandbox
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono uppercase bg-blue-950/80 text-blue-300 border border-blue-800/60 px-1.5 py-0.5 rounded">
                            🚀 Live Provider
                          </span>
                        );
                      })()}
                    </div>
                  ) : (
                    <span className="text-[10px] font-mono uppercase bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                      Disconnected
                    </span>
                  )}
                </div>

                {connectedAcc ? (
                  <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-lg p-3 space-y-1.5 text-xs text-zinc-400">
                    <div className="flex justify-between">
                      <span className="font-mono text-zinc-500">Channel ID:</span>
                      <span className="font-mono text-zinc-300">{connectedAcc.accountId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-mono text-zinc-500">Connected:</span>
                      <span>{formatTimeAgo(new Date(connectedAcc.createdAt))}</span>
                    </div>
                    <div className="pt-2 flex justify-between items-center border-t border-zinc-800/40">
                      <button
                        onClick={() => handleSync(connectedAcc.id, platform)}
                        disabled={syncingId === connectedAcc.id}
                        className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncingId === connectedAcc.id ? "animate-spin" : ""}`} />
                        {syncingId === connectedAcc.id ? "Syncing..." : "Sync Metrics"}
                      </button>

                      <button
                        onClick={() => handleRevoke(connectedAcc.id, platform)}
                        disabled={revokingId === connectedAcc.id}
                        className="text-xs text-red-400 hover:text-red-300 font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        {revokingId === connectedAcc.id ? "Revoking..." : "Revoke Access"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-2">
                    <button
                      onClick={() => handleConnect(platform)}
                      disabled={isConnecting}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {isConnecting ? "Authorizing..." : `Connect ${platform}`}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content Studio Link */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Ready to publish approved content?</h3>
          <p className="text-xs text-zinc-400 mt-1">
            Navigate to the Content Studio, select an asset in "APPROVED" status, and click "Publish to Channel".
          </p>
        </div>
        <Link
          href="/studio"
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold px-4 py-2.5 rounded-lg border border-zinc-700 transition-colors flex items-center gap-1.5 shrink-0"
        >
          <Send className="w-3.5 h-3.5 text-blue-400" />
          Open Content Studio
        </Link>
      </div>
    </div>
  );
}
