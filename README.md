# SOP Writer

Type a task, vendor product, or procedure — get back a production-ready, parameterized Standard Operating Procedure with a live-editable form and Markdown preview.

## Architecture

```
app/
  page.tsx                 # renders <SopWorkspace/>
  layout.tsx, globals.css
  api/generate/route.ts    # POST { topic } -> { sop } | { error }
  api/update/route.ts      # GET status / POST pull+build+restart, see "Self-updating"

scripts/
  supervisor.mjs            # production entrypoint (`npm run serve`) — restarts next start on update

lib/
  update/
    git.ts                  # thin wrappers over the git/npm CLIs used by the updater
    runner.ts                # orchestrates fetch -> pull -> install -> build -> restart
  llm/
    types.ts               # LlmAdapter interface, LlmAdapterError
    schema.ts               # single source of truth: zod schema + JSON Schema
    prompt.ts               # system/user prompt builders
    anthropic.ts            # Claude — tool-use, tool_choice forced
    openai.ts                # GPT — function-calling, tool_choice forced
    gemini.ts                # Gemini — responseSchema + responseMimeType:json
    ollama.ts                 # local models — format:"json" + schema-in-prompt
    index.ts                 # getLlmAdapter() factory, reads LLM_PROVIDER
  sop/
    parseJson.ts             # tolerant JSON extraction (fences, prose, trailing commas)
    reconcile.ts              # validates + syncs variables[] against {{placeholders}}
    template.ts                # extractPlaceholders(), renderTemplate() — used by both
                                # the server (reconcile) and the client (live preview)

components/
  SopWorkspace.tsx          # owns all state, wires everything together
  TopicInput.tsx            # the single input bar
  VariableForm.tsx          # dynamic form generated from variables[]
  MarkdownPreview.tsx       # rendered/source tabs, live substitution
  ActionBar.tsx             # regenerate / add field / copy / export md / export pdf
  AddFieldDialog.tsx        # small popover form for custom variables
  UpdatePanel.tsx            # header widget: check for updates / update now

types/sop.ts                 # SopDocument, SopVariable, VariableValues, LlmProvider
```

### Why an adapter interface instead of one SDK

`LlmAdapter` is one method: `generate(systemPrompt, userPrompt) -> Promise<string>`. Each provider adapter builds its own request with **raw `fetch`** (no `@anthropic-ai/sdk` / `openai` / `@google/generative-ai` packages) and returns the raw JSON text it got back, unvalidated. Parsing and schema validation happen once, centrally, in `app/api/generate/route.ts` — so swapping providers via `LLM_PROVIDER` never touches API-route or frontend code, and the dependency tree stays lean (no LLM SDKs at all).

Each adapter still gets the most reliable structured-output mechanism its provider offers:
- **Anthropic** — tool-use with `tool_choice` pinned to a single tool, so the only valid model output is well-formed `tool_use.input`.
- **OpenAI** — function-calling with `tool_choice` pinned the same way.
- **Gemini** — `generationConfig.responseSchema` + `responseMimeType: "application/json"`.
- **Ollama** — `format: "json"` plus the JSON Schema spelled out in the prompt itself, since local-model schema adherence varies. This is the adapter that leans hardest on `lib/sop/parseJson.ts`'s cleanup passes (strip code fences, slice a balanced `{...}` object out of surrounding prose, drop trailing commas) and `lib/sop/reconcile.ts`'s auto-repair (any `{{key}}` used in the markdown but missing from `variables[]` gets synthesized; any declared variable never referenced gets dropped).

### Live preview without re-calling the API

`lib/sop/template.ts#renderTemplate` does the `{{key}}` substitution entirely client-side against local React state (`values`). Editing a form field or the raw Markdown source re-renders instantly — the API is only called on Generate/Regenerate.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the key for whichever provider you pick
npm run dev                  # http://localhost:3000
```

### Running self-hosted with self-update enabled

`npm run dev` and a bare `npm start` both work fine, but neither can restart
itself. To get the "Update Now" button in the GUI to actually apply an
update, run the app through the supervisor instead:

```bash
npm run build
npm run serve      # scripts/supervisor.mjs — wraps `next start`, restarts it on update
```

The header's commit badge (`git branch icon` + short SHA) opens a panel to
check for and apply updates. Clicking **Update Now** does, server-side:
`git fetch` → `git pull --ff-only` → `npm install` → `npm run build` →
process exit with a code the supervisor recognizes as "relaunch me." The
supervisor immediately restarts `next start`, now serving the new build; the
GUI polls until the server responds again and reloads itself.

Guardrails baked in:
- Refuses to update if the working tree has uncommitted local changes (won't silently discard your edits).
- Only fast-forward pulls (`--ff-only`) — a diverged local history fails loudly instead of merging or resetting.
- Without the supervisor, it still pulls + rebuilds but reports that a manual restart is needed, rather than killing a process nothing will bring back.
- Set `UPDATE_TOKEN` (see `.env.example`) if this instance is reachable by anyone besides you — the GUI has a small settings gear next to the update panel to store the matching token in that browser's `localStorage`.

### Environment variables

| Variable | Required when | Notes |
|---|---|---|
| `LLM_PROVIDER` | always | `anthropic` \| `openai` \| `gemini` \| `ollama` — default `anthropic` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | `LLM_PROVIDER=anthropic` | model defaults to `claude-sonnet-4-5` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | `LLM_PROVIDER=openai` | model defaults to `gpt-4o` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | `LLM_PROVIDER=gemini` | model defaults to `gemini-2.0-flash` |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | `LLM_PROVIDER=ollama` | no API key; point at a running `ollama serve`, defaults to `http://localhost:11434` / `llama3.1` |

## Notable behavior

- **Add Custom Field** adds a form field immediately; paste `{{your_key}}` into the Source tab to wire it into the document. Conversely, typing a new `{{key}}` directly into Source auto-creates its form field — the two directions are kept in sync in `SopWorkspace.tsx#handleTemplateChange`.
- **Export PDF** uses the browser's native print dialog against a `#print-target`-scoped print stylesheet (`app/globals.css`) — no server-side rendering dependency.
- **Regenerate** discards current field values/edits after a confirm prompt, then re-runs the same topic through the pipeline.
