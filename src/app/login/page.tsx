"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ArrowRight, Sparkles, Lock, Mail, User } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setErrorMsg("");

      const action = isRegister ? "register" : "login";
      const res = await fetch(`/api/auth?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await fetch("/api/auth?action=login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "operator@mediaos.local",
          password: "Password123!",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Demo login failed");
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Demo login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-lg mx-auto shadow-md">
            M
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {isRegister ? "Create MediaOS Workspace" : "MediaOS Operator Access"}
          </h1>
          <p className="text-xs text-zinc-400">
            {isRegister
              ? "Initialize your brand brain and production operating system."
              : "Sign in to manage campaigns, agents, and editorial approvals."}
          </p>
        </div>

        {/* Demo Login Quick Button */}
        <div className="bg-blue-950/40 border border-blue-900/50 rounded-xl p-3.5 text-center space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-blue-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Reviewer & Developer Access</span>
          </div>
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <span>One-Click Login as Seeded Operator</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <p className="text-[10px] text-zinc-400 font-mono">
            operator@mediaos.local • Password123!
          </p>
        </div>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-zinc-800 w-full" />
          <span className="bg-zinc-900 px-3 text-[11px] text-zinc-500 font-mono uppercase">
            Or credentials
          </span>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-950/70 border border-rose-800/80 rounded-lg text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Full Name / Creator Handle
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Vance"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                placeholder="operator@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Authenticating..." : isRegister ? "Create Account & Workspace" : "Sign In"}
          </button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-zinc-400 hover:text-white transition-colors"
          >
            {isRegister
              ? "Already have an account? Sign in"
              : "Need a new workspace? Register here"}
          </button>
        </div>
      </div>
    </div>
  );
}
