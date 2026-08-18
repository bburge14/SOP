// Single source of truth for which model IDs the app offers per provider —
// imported by both the server adapters (as the hardcoded fallback when no
// *_MODEL env var / desktop setting is set) and the frontend model
// dropdowns (DesktopOnboarding, DesktopSettingsPanel), so there's exactly
// one place to update when a vendor deprecates a model.
//
// A previous hardcoded default (gemini-2.0-flash) went dead in production
// with a 404 once Google retired it — model IDs drift over time in a way
// package versions don't, so this file is expected to need updates; it's
// deliberately not folded into a "fetch it once, forget it" constant.
export interface ModelOption {
  id: string;
  label: string;
}

export const GEMINI_MODELS: ModelOption[] = [
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (Recommended)" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash (Newest, more capable)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Higher quality, slower)" },
];

export const OPENAI_MODELS: ModelOption[] = [
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra (Recommended)" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol (Frontier, most capable)" },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna (Budget)" },
];

export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0]!.id;
export const DEFAULT_OPENAI_MODEL = OPENAI_MODELS[0]!.id;
