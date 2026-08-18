"use client";

import { FormEvent, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

interface TopicInputProps {
  onSubmit: (topic: string) => void;
  loading: boolean;
  initialValue?: string;
}

export default function TopicInput({ onSubmit, loading, initialValue = "" }: TopicInputProps) {
  const [topic, setTopic] = useState(initialValue);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim() || loading) return;
    onSubmit(topic.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder='e.g. "Cisco Catalyst 2960 initial VLAN configuration"'
        className="flex-1 bg-panel border border-border rounded-lg px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading || !topic.trim()}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {loading ? "Generating…" : "Generate SOP"}
      </button>
    </form>
  );
}
