"use client";

import type { DesktopProvider } from "@/types/electron";
import { GEMINI_MODELS, OPENAI_MODELS } from "@/lib/llm/modelOptions";

interface ModelSelectProps {
  provider: DesktopProvider;
  value: string;
  onChange: (value: string) => void;
}

const inputClasses =
  "w-full bg-canvas border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60";

/**
 * Ollama's model catalog is whatever the user has pulled locally — no API
 * to enumerate it from here, so that stays free text. Gemini/OpenAI get a
 * real dropdown from lib/llm/modelOptions.ts's curated, recommended-first
 * list. If the currently-set value isn't in that list (e.g. a model a
 * vendor has since deprecated, or one picked before this list existed),
 * it's kept as a selectable option rather than silently swapped out from
 * under the user.
 */
export default function ModelSelect({ provider, value, onChange }: ModelSelectProps) {
  if (provider === "ollama") {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. llama3.1, mistral, qwen2.5"
        className={inputClasses}
      />
    );
  }

  const known = provider === "gemini" ? GEMINI_MODELS : OPENAI_MODELS;
  const options = !value || known.some((m) => m.id === value) ? known : [{ id: value, label: `${value} (currently set)` }, ...known];

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClasses}>
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
