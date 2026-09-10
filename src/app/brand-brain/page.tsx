"use client";

import { useEffect, useState } from "react";
import {
  BrainCircuit,
  Save,
  CheckCircle2,
  Plus,
  Trash2,
  ShieldCheck,
  Target,
  Sparkles,
  Volume2,
  ListChecks,
} from "lucide-react";

interface BrandBrainData {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  identity: {
    mission: string;
    vision: string | null;
    positioning: string;
    values: string;
  } | null;
  audience: {
    targetAudience: string;
    painPoints: string;
    desires: string;
    objections: string;
  } | null;
  voice: {
    tone: string;
    styleGuidelines: string;
    forbiddenWords: string;
    signaturePhrases: string;
  } | null;
  pillars: Array<{
    id: string;
    name: string;
    description: string;
    priority: number;
    weight: number;
  }>;
  editorialRules: Array<{
    id: string;
    rule: string;
    category: string;
    severity: string;
    rationale: string | null;
  }>;
  proofs: Array<{
    id: string;
    claim: string;
    evidenceSnippet: string;
    sourceUrl: string | null;
  }>;
}

export default function BrandBrainPage() {
  const [data, setData] = useState<BrandBrainData | null>(null);
  const [activeTab, setActiveTab] = useState<"identity" | "audience" | "voice" | "pillars" | "rules" | "proofs">("identity");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Form states
  const [mission, setMission] = useState("");
  const [positioning, setPositioning] = useState("");
  const [values, setValues] = useState("");

  const [targetAudience, setTargetAudience] = useState("");
  const [painPoints, setPainPoints] = useState("");
  const [desires, setDesires] = useState("");
  const [objections, setObjections] = useState("");

  const [tone, setTone] = useState("");
  const [styleGuidelines, setStyleGuidelines] = useState("");
  const [forbiddenWords, setForbiddenWords] = useState("");
  const [signaturePhrases, setSignaturePhrases] = useState("");

  // Pillar Form
  const [newPillarName, setNewPillarName] = useState("");
  const [newPillarDesc, setNewPillarDesc] = useState("");

  // Rule Form
  const [newRuleText, setNewRuleText] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState("TONE");
  const [newRuleSeverity, setNewRuleSeverity] = useState("WARNING");

  const fetchBrandBrain = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/brand-brain");
      const json = await res.json();
      if (json.brandBrain) {
        const b = json.brandBrain;
        setData(b);
        if (b.identity) {
          setMission(b.identity.mission || "");
          setPositioning(b.identity.positioning || "");
          setValues(b.identity.values || "");
        }
        if (b.audience) {
          setTargetAudience(b.audience.targetAudience || "");
          setPainPoints(b.audience.painPoints || "");
          setDesires(b.audience.desires || "");
          setObjections(b.audience.objections || "");
        }
        if (b.voice) {
          setTone(b.voice.tone || "");
          setStyleGuidelines(b.voice.styleGuidelines || "");
          setForbiddenWords(b.voice.forbiddenWords || "");
          setSignaturePhrases(b.voice.signaturePhrases || "");
        }
      }
    } catch (err) {
      setErrorMsg("Failed to load Brand Brain");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBrandBrain();
  }, []);

  const handleSaveSection = async (section: "identity" | "audience" | "voice") => {
    try {
      setSaving(true);
      setSaveSuccess(false);
      setErrorMsg("");

      let payload = {};
      if (section === "identity") {
        payload = { mission, positioning, values };
      } else if (section === "audience") {
        payload = { targetAudience, painPoints, desires, objections };
      } else if (section === "voice") {
        payload = { tone, styleGuidelines, forbiddenWords, signaturePhrases };
      }

      const res = await fetch("/api/brand-brain", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, data: payload }),
      });

      if (!res.ok) throw new Error("Save failed");

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchBrandBrain();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleAddPillar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPillarName) return;

    try {
      const res = await fetch("/api/brand-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "pillar",
          data: { name: newPillarName, description: newPillarDesc, priority: 1, weight: 25 },
        }),
      });
      if (res.ok) {
        setNewPillarName("");
        setNewPillarDesc("");
        fetchBrandBrain();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePillar = async (id: string) => {
    try {
      await fetch(`/api/brand-brain?type=pillar&id=${id}`, { method: "DELETE" });
      fetchBrandBrain();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleText) return;

    try {
      const res = await fetch("/api/brand-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "editorialRule",
          data: { rule: newRuleText, category: newRuleCategory, severity: newRuleSeverity },
        }),
      });
      if (res.ok) {
        setNewRuleText("");
        fetchBrandBrain();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await fetch(`/api/brand-brain?type=editorialRule&id=${id}`, { method: "DELETE" });
      fetchBrandBrain();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-xs font-mono text-zinc-500">
        Loading Brand Brain editorial memory...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <BrainCircuit className="w-6 h-6 text-blue-500" />
            Brand Brain Studio
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Persistent editorial memory. Injected selectively into AI agent context.
          </p>
        </div>

        {saveSuccess && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-3 py-1.5 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5" /> Changes Persisted to SQLite
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
        {[
          { id: "identity", label: "Identity & Mission", icon: Target },
          { id: "audience", label: "Audience Profile", icon: Sparkles },
          { id: "voice", label: "Brand Voice", icon: Volume2 },
          { id: "pillars", label: "Content Pillars", icon: ListChecks },
          { id: "rules", label: "Editorial Rules", icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? "bg-zinc-800 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-blue-400" : "text-zinc-500"}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content Panels */}
      {activeTab === "identity" && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-bold text-white">Brand Identity & Core Positioning</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Mission Statement
              </label>
              <textarea
                rows={2}
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-3 rounded-lg focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Market Positioning
              </label>
              <textarea
                rows={2}
                value={positioning}
                onChange={(e) => setPositioning(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-3 rounded-lg focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Core Values (Comma separated)
              </label>
              <input
                type="text"
                value={values}
                onChange={(e) => setValues(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-3 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="pt-2">
              <button
                onClick={() => handleSaveSection("identity")}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "Saving..." : "Save Identity"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "audience" && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-bold text-white">Target Audience & Customer Profile</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Target Audience Demographics & Persona
              </label>
              <textarea
                rows={2}
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-3 rounded-lg focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Core Pain Points
              </label>
              <textarea
                rows={2}
                value={painPoints}
                onChange={(e) => setPainPoints(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-3 rounded-lg focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Key Desires & Outcomes
              </label>
              <textarea
                rows={2}
                value={desires}
                onChange={(e) => setDesires(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-3 rounded-lg focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Common Audience Objections & Skepticism
              </label>
              <textarea
                rows={2}
                value={objections}
                onChange={(e) => setObjections(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-3 rounded-lg focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            <div className="pt-2">
              <button
                onClick={() => handleSaveSection("audience")}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "Saving..." : "Save Audience Profile"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "voice" && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-bold text-white">Brand Voice, Constraints & Tone</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Tone Description
              </label>
              <input
                type="text"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-3 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Style Guidelines
              </label>
              <textarea
                rows={2}
                value={styleGuidelines}
                onChange={(e) => setStyleGuidelines(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-3 rounded-lg focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-rose-400 mb-1">
                Forbidden Words (Flagged by Editor Agent)
              </label>
              <input
                type="text"
                value={forbiddenWords}
                onChange={(e) => setForbiddenWords(e.target.value)}
                placeholder="delve, supercharge, game-changer, revolutionary"
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-rose-300 p-3 rounded-lg focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Signature Phrases & Mantras
              </label>
              <input
                type="text"
                value={signaturePhrases}
                onChange={(e) => setSignaturePhrases(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-3 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="pt-2">
              <button
                onClick={() => handleSaveSection("voice")}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "Saving..." : "Save Brand Voice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "pillars" && (
        <div className="space-y-6">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-white">Active Content Pillars</h2>

            <div className="space-y-2.5">
              {data?.pillars.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs"
                >
                  <div className="space-y-1 max-w-xl">
                    <div className="font-bold text-zinc-100">{p.name}</div>
                    <div className="text-zinc-400 text-[11px] leading-relaxed">
                      {p.description}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      Weight {p.weight}%
                    </span>
                    <button
                      onClick={() => handleDeletePillar(p.id)}
                      className="text-zinc-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add Pillar Form */}
          <form onSubmit={handleAddPillar} className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">
              Add New Pillar
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Pillar Name"
                value={newPillarName}
                onChange={(e) => setNewPillarName(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                placeholder="Description / Authority Focus"
                value={newPillarDesc}
                onChange={(e) => setNewPillarDesc(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Content Pillar
            </button>
          </form>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-6">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-white">Editorial Governance Rules</h2>

            <div className="space-y-2.5">
              {data?.editorialRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs"
                >
                  <div className="space-y-1 max-w-xl">
                    <div className="font-semibold text-zinc-200">{rule.rule}</div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                      <span>Category: {rule.category}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        rule.severity === "CRITICAL"
                          ? "bg-rose-950/70 text-rose-400 border-rose-800/60"
                          : "bg-amber-950/70 text-amber-400 border-amber-800/60"
                      }`}
                    >
                      {rule.severity}
                    </span>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="text-zinc-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add Rule Form */}
          <form onSubmit={handleAddRule} className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">
              Add Editorial Rule
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Rule statement"
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                className="sm:col-span-2 bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
              />
              <select
                value={newRuleSeverity}
                onChange={(e) => setNewRuleSeverity(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
              >
                <option value="CRITICAL">CRITICAL</option>
                <option value="WARNING">WARNING</option>
                <option value="SUGGESTION">SUGGESTION</option>
              </select>
            </div>
            <button
              type="submit"
              className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Editorial Rule
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
