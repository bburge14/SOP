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
  install.sh                # clone (if needed) + npm install + build + optional systemd service
  update.sh                  # CLI equivalent of the GUI "Update Now" button
  uninstall.sh                # stop/remove the systemd service, optionally purge/delete
  supervisor.mjs               # fallback production entrypoint (`npm run serve`) for non-systemd hosts

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

## Quickstart (dev)

```bash
npm install
cp .env.example .env.local   # fill in the key for whichever provider you pick
npm run dev                  # http://localhost:3000
```

## Install (self-hosted, with self-update)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/bburge14/SOP/main/scripts/install.sh)
```

This clones the repo (default `~/sop-writer`, override with `--dir`), runs
`npm install`, walks you through picking an LLM provider + API key into
`.env.local`, builds a production bundle, and — on Linux with systemd —
registers and starts a `systemd --user` service named `sop-writer`. Run
`loginctl enable-linger $USER` afterward so it keeps running after you log
out. Pass `--no-service` to skip that and just build; `--port PORT` to pick
a port other than 3000.

Already have a checkout? Run `npm run app:install` (or `bash
scripts/install.sh`) from inside it instead — it detects the existing
checkout and installs in place.

### Update

The header's commit badge (git-branch icon + short SHA) opens a panel to
check for and apply updates from the browser. **Update Now** runs, server-side:
`git fetch` → `git pull --ff-only` → `npm install` → `npm run build` → restart.
Or from the CLI: `npm run app:update` (or `bash scripts/update.sh`).

Restart path, in order of preference:
1. **systemd** — if running as the `sop-writer.service` unit `install.sh` set up, the update triggers `systemctl --user restart sop-writer`. This also gets you crash-restart and start-on-boot for free.
2. **supervisor** — if started via `npm run serve` (`scripts/supervisor.mjs`) without systemd (e.g. macOS), the app process exits with a sentinel code the supervisor watches for and relaunches `next start`. No crash-restart — it only handles the update-triggered restart.
3. **manual** — plain `npm run dev` / `npm start`: the update still pulls + rebuilds but reports that you need to restart the process yourself.

Guardrails baked in:
- Refuses to update if the working tree has uncommitted local changes (won't silently discard your edits).
- Only fast-forward pulls (`--ff-only`) — a diverged local history fails loudly instead of merging or resetting.
- Set `UPDATE_TOKEN` (see `.env.example`) if this instance is reachable by anyone besides you — the GUI has a small settings gear next to the update panel to store the matching token in that browser's `localStorage`.

### Uninstall

```bash
npm run app:uninstall                  # stop + remove the systemd service only
bash scripts/uninstall.sh --purge      # also remove node_modules/ and .next/
bash scripts/uninstall.sh --remove-all # also delete the whole install directory (confirmation required)
```

### Environment variables

| Variable | Required when | Notes |
|---|---|---|
| `LLM_PROVIDER` | always | `anthropic` \| `openai` \| `gemini` \| `ollama` — default `anthropic` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | `LLM_PROVIDER=anthropic` | model defaults to `claude-sonnet-4-5` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | `LLM_PROVIDER=openai` | model defaults to `gpt-4o` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | `LLM_PROVIDER=gemini` | model defaults to `gemini-2.0-flash` |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | `LLM_PROVIDER=ollama` | no API key; point at a running `ollama serve`, defaults to `http://localhost:11434` / `llama3.1` |

## Releases

Tagged as `vX.Y.Z` on GitHub (semver, matching the `version` field in
`package.json`). See [Releases](https://github.com/bburge14/SOP/releases)
for changelogs. `scripts/install.sh` and `scripts/update.sh` always track
the `main` branch, not a specific release tag.

## Notable behavior

- **Add Custom Field** adds a form field immediately; paste `{{your_key}}` into the Source tab to wire it into the document. Conversely, typing a new `{{key}}` directly into Source auto-creates its form field — the two directions are kept in sync in `SopWorkspace.tsx#handleTemplateChange`.
- **Export PDF** uses the browser's native print dialog against a `#print-target`-scoped print stylesheet (`app/globals.css`) — no server-side rendering dependency.
- **Regenerate** discards current field values/edits after a confirm prompt, then re-runs the same topic through the pipeline.

<!-- last verified: install/update/uninstall lifecycle tested end-to-end -->
