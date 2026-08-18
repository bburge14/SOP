"use client";

import { X } from "lucide-react";
import type { SopVariable, VariableValues } from "@/types/sop";

interface VariableFormProps {
  variables: SopVariable[];
  values: VariableValues;
  customKeys: Set<string>;
  onChange: (key: string, value: string | number | boolean) => void;
  onRemove: (key: string) => void;
}

export default function VariableForm({ variables, values, customKeys, onChange, onRemove }: VariableFormProps) {
  if (variables.length === 0) {
    return <p className="text-sm text-slate-500">No variables yet. Generate an SOP to populate this form.</p>;
  }

  return (
    <div className="space-y-4">
      {variables.map((variable) => (
        <div key={variable.key} className="group">
          <div className="flex items-center justify-between gap-2 mb-1">
            <label htmlFor={`var-${variable.key}`} className="text-sm font-medium text-slate-200">
              {variable.label}
            </label>
            <div className="flex items-center gap-2">
              <code className="text-[11px] text-slate-500">{`{{${variable.key}}}`}</code>
              {customKeys.has(variable.key) && (
                <button
                  type="button"
                  onClick={() => onRemove(variable.key)}
                  className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${variable.key}`}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <FieldInput variable={variable} value={values[variable.key]} onChange={(v) => onChange(variable.key, v)} />

          {variable.description && <p className="text-xs text-slate-500 mt-1">{variable.description}</p>}
        </div>
      ))}
    </div>
  );
}

function FieldInput({
  variable,
  value,
  onChange,
}: {
  variable: SopVariable;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
}) {
  const id = `var-${variable.key}`;
  const baseClasses =
    "w-full bg-panel border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60";

  if (variable.type === "boolean") {
    const checked = typeof value === "boolean" ? value : String(value).toLowerCase() === "true";
    return (
      <label htmlFor={id} className="flex items-center gap-2 cursor-pointer select-none">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 rounded border-border bg-panel accent-indigo-500"
        />
        <span className="text-xs text-slate-400">{checked ? "true" : "false"}</span>
      </label>
    );
  }

  if (variable.type === "number") {
    return (
      <input
        id={id}
        type="number"
        value={value === undefined ? "" : Number(value)}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className={baseClasses}
      />
    );
  }

  return (
    <input
      id={id}
      type="text"
      value={value === undefined ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      className={baseClasses}
    />
  );
}
