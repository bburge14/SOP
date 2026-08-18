import { AnthropicAdapter } from "@/lib/llm/anthropic";
import { OpenAiAdapter } from "@/lib/llm/openai";
import { GeminiAdapter } from "@/lib/llm/gemini";
import { OllamaAdapter } from "@/lib/llm/ollama";
import { LlmAdapterError, type LlmAdapter } from "@/lib/llm/types";
import type { LlmProvider } from "@/types/sop";

const PROVIDERS: LlmProvider[] = ["anthropic", "openai", "gemini", "ollama"];

/**
 * Reads LLM_PROVIDER at request time (not module load time) so a single
 * running server picks up .env changes across restarts without any
 * provider-specific code elsewhere in the app — every caller just does
 * `getLlmAdapter().generate(system, user)`.
 */
export function getLlmAdapter(): LlmAdapter {
  const provider = (process.env.LLM_PROVIDER || "anthropic").toLowerCase() as LlmProvider;

  if (!PROVIDERS.includes(provider)) {
    throw new LlmAdapterError(
      "config",
      `Unknown LLM_PROVIDER "${provider}". Expected one of: ${PROVIDERS.join(", ")}`
    );
  }

  switch (provider) {
    case "anthropic":
      return new AnthropicAdapter();
    case "openai":
      return new OpenAiAdapter();
    case "gemini":
      return new GeminiAdapter();
    case "ollama":
      return new OllamaAdapter();
  }
}
