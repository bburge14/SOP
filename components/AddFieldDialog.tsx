"use client";

import { FormEvent, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { SopVariable, VariableType } from "@/types/sop";
import { useOnClickOutside } from "@/lib/hooks/useOnClickOutside";

interface AddFieldDialogProps {
  existingKeys: Set<string>;
  onAdd: (variable: SopVariable) => void;
}

const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export default function AddFieldDialog({ existingKeys, onAdd }: AddFieldDialogProps) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<VariableType>("string");
  const [defaultValue, setDefaultValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(containerRef, () => setOpen(false), open);

  function reset() {
    setKey("");
    setLabel("");
    setType("string");
    setDefaultValue("");
    setError(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedKey = key.trim();
    if (!KEY_RE.test(trimmedKey)) {
      setError("Key must be a valid identifier, e.g. backup_retention_days.");
      return;
    }
    if (existingKeys.has(trimmedKey)) {
      setError("A variable with that key already exists.");
      return;
    }

    const coercedDefault: string | number | boolean =
      type === "number" ? Number(defaultValue) || 0 : type === "boolean" ? defaultValue === "true" : defaultValue;

    onAdd({
      key: trimmedKey,
      label: label.trim() || trimmedKey,
      description: "Custom field — insert {{" + trimmedKey + "}} into the source markdown to use it.",
      default: coercedDefault,
      type,
    });

    reset();
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Add Custom Field"
          className="flex items-center justify-center size-9 rounded-md border border-border text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
        >
          <Plus className="size-3.5" />
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="absolute z-10 mt-2 w-80 bg-panel border border-border rounded-lg p-4 shadow-xl space-y-3"
        >
          <div>
            <label className="text-xs text-slate-400 block mb-1">Key (used as {"{{key}}"})</label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="backup_retention_days"
              className="w-full bg-canvas border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Backup Retention (days)"
              className="w-full bg-canvas border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as VariableType)}
                className="w-full bg-canvas border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">Default</label>
              <input
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                placeholder={type === "boolean" ? "true / false" : ""}
                className="w-full bg-canvas border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md"
            >
              Add Field
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
