"use client";

import { Loader2, X } from "lucide-react";
import type { SopVariable, VariableValues } from "@/types/sop";

interface VariableFormProps {
  variables: SopVariable[];
  values: VariableValues;
  onChange: (key: string, value: string | number | boolean) => void;
  onRemove: (key: string) => void;
  onHoverField?: (key: string | null) => void;
  /** True while any field removal (or other Refine call) is in flight — locks the whole form so a value can't be edited out from under an in-progress AI rewrite. */
  disabled?: boolean;
  /** The specific field whose Remove button triggered the in-flight call, if any — shown with a spinner instead of the plain disabled X. */
  removingKey?: string | null;
}

export default function VariableForm({
  variables,
  values,
  onChange,
  onRemove,
  onHoverField,
  disabled = false,
  removingKey = null,
}: VariableFormProps) {
  if (variables.length === 0) {
    return <p className="text-sm text-slate-500">No variables yet. Generate an SOP to populate this form.</p>;
  }

  return (
    <div className="space-y-4">
      {variables.map((variable) => {
        const isRemoving = removingKey === variable.key;
        return (
          <div
            key={variable.key}
            className="group"
            onMouseEnter={() => onHoverField?.(variable.key)}
            onMouseLeave={() => onHoverField?.(null)}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <label htmlFor={`var-${variable.key}`} className="text-sm font-medium text-slate-200">
                {variable.label}
              </label>
              <div className="flex items-center gap-2">
                <code className="text-[11px] text-slate-500">{`{{${variable.key}}}`}</code>
                <button
                  type="button"
                  onClick={() => onRemove(variable.key)}
                  disabled={disabled}
                  className={`text-slate-500 hover:text-red-400 transition-opacity disabled:hover:text-slate-500 disabled:cursor-not-allowed ${
                    isRemoving ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  aria-label={`Remove ${variable.key}`}
                  title="Remove this field — the AI rewrites every step that referenced it so the document reads naturally without it"
                >
                  {isRemoving ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                </button>
              </div>
            </div>

            <FieldInput
              variable={variable}
              value={values[variable.key]}
              onChange={(v) => onChange(variable.key, v)}
              disabled={disabled}
            />

            {variable.description && <p className="text-xs text-slate-500 mt-1">{variable.description}</p>}
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({
  variable,
  value,
  onChange,
  disabled,
}: {
  variable: SopVariable;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
  disabled?: boolean;
}) {
  const id = `var-${variable.key}`;
  const baseClasses =
    "w-full bg-panel border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 disabled:opacity-60";

  if (variable.type === "boolean") {
    const checked = typeof value === "boolean" ? value : String(value).toLowerCase() === "true";
    return (
      <label htmlFor={id} className="flex items-center gap-2 cursor-pointer select-none">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="size-4 rounded border-border bg-panel accent-indigo-500 disabled:opacity-60"
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
        disabled={disabled}
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
      disabled={disabled}
      className={baseClasses}
    />
  );
}
