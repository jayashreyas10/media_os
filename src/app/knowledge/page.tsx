"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Plus,
  Search,
  Tag,
  ExternalLink,
  Trash2,
  Filter,
  X,
  FileText,
  Globe,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  type: string;
  sourceUrl: string | null;
  tags: string | null;
  confidence: number;
  createdAt: string;
  brand?: { name: string } | null;
}

const KNOWLEDGE_TYPES = [
  "ALL",
  "NOTE",
  "DOCUMENT",
  "URL",
  "TRANSCRIPT",
  "EXAMPLE",
  "CAMPAIGN",
  "RESEARCH",
  "PLAYBOOK",
];

export default function KnowledgeBasePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // New Item Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("NOTE");
  const [sourceUrl, setSourceUrl] = useState("");
  const [tags, setTags] = useState("");
  const [confidence, setConfidence] = useState(90);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const fetchItems = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (typeFilter !== "ALL") params.append("type", typeFilter);
      if (search) params.append("search", search);
      if (selectedTag) params.append("tag", selectedTag);

      const res = await fetch(`/api/knowledge?${params.toString()}`);
      const data = await res.json();
      if (data.items) setItems(data.items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [typeFilter, selectedTag]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchItems();
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) return;

    try {
      setSubmitting(true);
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          type,
          sourceUrl: sourceUrl || undefined,
          tags: tags || undefined,
          confidence,
        }),
      });

      if (res.ok) {
        setSuccessMsg("Knowledge item saved.");
        setTimeout(() => setSuccessMsg(""), 3000);
        setModalOpen(false);
        setTitle("");
        setContent("");
        setSourceUrl("");
        setTags("");
        fetchItems();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
      fetchItems();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-blue-500" />
            Knowledge Base
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Searchable repository for technical notes, research papers, transcripts, and playbooks.
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Knowledge Item
        </button>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-950/70 border border-emerald-800/80 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Search & Type Filter Bar */}
      <div className="space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search knowledge by title, keywords, or content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:border-zinc-700"
            />
          </div>
          <button
            type="submit"
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
          {KNOWLEDGE_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-[11px] font-mono px-3 py-1 rounded-md transition-colors ${
                typeFilter === t
                  ? "bg-blue-600 text-white font-semibold"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Knowledge Items Grid */}
      {loading ? (
        <div className="py-16 text-center text-xs font-mono text-zinc-500">
          Loading knowledge repository...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl p-8 space-y-3">
          <p className="text-sm text-zinc-400">No knowledge items match current filters.</p>
          <button
            onClick={() => setModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-md"
          >
            Create First Knowledge Entry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 rounded-xl p-5 flex flex-col justify-between transition-all space-y-3"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold">
                    {item.type}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    {item.confidence}% confidence
                  </span>
                </div>

                <h3 className="text-sm font-bold text-zinc-100 leading-snug">
                  {item.title}
                </h3>

                <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                  {item.content}
                </p>

                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 font-mono truncate"
                  >
                    <Globe className="w-3 h-3 shrink-0" />
                    <span className="truncate">{item.sourceUrl}</span>
                  </a>
                )}

                {item.tags && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {item.tags.split(",").map((t, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-400 border border-zinc-800"
                      >
                        #{t.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                <span>{formatTimeAgo(item.createdAt)}</span>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-zinc-500 hover:text-rose-400 p-1 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Knowledge Item Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Add Knowledge Entry</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. State Machine Finite Automata in Agent Design"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Item Type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                  >
                    <option value="NOTE">NOTE</option>
                    <option value="DOCUMENT">DOCUMENT</option>
                    <option value="URL">URL</option>
                    <option value="TRANSCRIPT">TRANSCRIPT</option>
                    <option value="EXAMPLE">EXAMPLE</option>
                    <option value="CAMPAIGN">CAMPAIGN</option>
                    <option value="RESEARCH">RESEARCH</option>
                    <option value="PLAYBOOK">PLAYBOOK</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Confidence (1-100)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={confidence}
                    onChange={(e) => setConfidence(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Content / Knowledge Text *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Paste excerpt, research notes, or synthesis..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Source URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Tags (Comma separated)
                  </label>
                  <input
                    type="text"
                    placeholder="agents, architecture, python"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Add Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
