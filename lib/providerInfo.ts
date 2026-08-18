import type { DesktopProvider } from "@/types/electron";

export interface ProviderInfo {
  blurb: string;
  linkLabel: string;
  linkUrl: string;
}

// URLs verified 2026-08-18 against Google/OpenAI's own current docs.
export const PROVIDER_INFO: Record<DesktopProvider, ProviderInfo> = {
  gemini: {
    blurb: "Free tier available — sign in with a Google account, no credit card required.",
    linkLabel: "Get a free Gemini API key →",
    linkUrl: "https://aistudio.google.com/app/apikey",
  },
  openai: {
    blurb: "Requires an OpenAI account with billing set up — this is a paid, metered API key.",
    linkLabel: "Create an OpenAI API key →",
    linkUrl: "https://platform.openai.com/api-keys",
  },
  ollama: {
    blurb: "Free and runs entirely on your machine. Install Ollama, then run `ollama serve` before generating.",
    linkLabel: "Download Ollama →",
    linkUrl: "https://ollama.com",
  },
};
