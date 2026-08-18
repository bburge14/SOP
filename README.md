# SOP Writer

Type a task, vendor product, or procedure — get back a production-ready, parameterized Standard Operating Procedure with a live-editable form and Markdown preview.

## Desktop App (recommended)

Download the installer for your OS from [Releases](https://github.com/bburge14/SOP/releases) — `.exe` (Windows), `.dmg` (Mac), or `.AppImage`/`.deb` (Linux) — and double-click it. No terminal, no `git clone`, no editing config files.

- **First launch** asks you to pick an LLM provider and paste an API key into a Settings screen (gear icon, top right) — stored encrypted via your OS keychain (Keychain on Mac, DPAPI on Windows, libsecret on Linux), not a plaintext file.
- **Updates** are fully in-app: the version badge (top right) checks GitHub Releases, and **Download** → **Restart & Install** applies it — the same pattern as any normal desktop app's auto-updater (`electron-updater`).
- Since there's no paid code-signing certificate behind these builds, **Windows SmartScreen** will show "Windows protected your PC" (click **More info → Run anyway**) and **macOS Gatekeeper** will say the app is from an "unidentified developer" (right-click the app → **Open**, first launch only) — normal for indie-distributed apps, not a sign anything's wrong.

Under the hood this is the exact same Next.js app described below (`app/`, `components/`, `lib/`), wrapped by `electron/` — see that section for how the two distributions relate.

## Architecture

```
app/
  page.tsx                 # renders <SopWorkspace/>
  layout.tsx, globals.css
  api/generate/route.ts    # POST { topic } -> { sop } | { error }
  api/update/route.ts      # GET status / POST pull+build+restart, see "Self-updating"

electron/
  main.js                    # spawns the Next standalone server, owns the BrowserWindow, wires electron-updater
  preload.js                  # contextBridge — exposes window.electronAPI to the renderer
  settingsStore.js             # provider/API-key config, persisted in Electron's userData dir
  safeStorageBridge.js          # runs safeStorage in a disposable timed-out helper process — see below

scripts/
  install.sh                # (self-hosted only) clone + npm install + build + optional systemd service
  update.sh                  # (self-hosted only) CLI equivalent of the GUI "Update Now" button
  uninstall.sh                # (self-hosted only) stop/remove the systemd service, optionally purge/delete
  supervisor.mjs               # (self-hosted only) fallback entrypoint (`npm run serve`) for non-systemd hosts
  prepare-standalone.mjs        # copies static assets into .next/standalone, used by both distributions

lib/
  update/
    git.ts                  # thin wrappers over the git/npm CLIs used by the updater
    runner.ts                # orchestrates fetch -> pull -> install -> build -> restart
  llm/
    types.ts               # LlmAdapter interface, LlmAdapterError
    schema.ts               # single source of truth: zod schema + JSON Schema
    modelOptions.ts           # curated model IDs + recommended default per provider
    prompt.ts               # system/user prompt builders
    openai.ts                # GPT — function-calling, tool_choice forced
    gemini.ts                # Gemini — responseSchema + responseMimeType:json
    ollama.ts                 # local models — format:"json" + schema-in-prompt
    retry.ts                   # shared fetchWithRetry() — backs off on 429/5xx, fails fast otherwise
    humanizeError.ts            # raw provider error body -> one clean, actionable sentence
    index.ts                 # getLlmAdapter() factory, reads LLM_PROVIDER
  sop/
    parseJson.ts             # tolerant JSON extraction (fences, prose, trailing commas)
    reconcile.ts              # validates + syncs variables[] against {{placeholders}}
    template.ts                # extractPlaceholders(), renderTemplate() — used by both
                                # the server (reconcile) and the client (live preview)
    markdownToDocx.ts            # markdown -> real .docx (headings/lists/tables/images), client-side
    docxToMarkdown.ts             # imported .docx -> markdown (mammoth + turndown/GFM), client-side
  providerInfo.ts             # onboarding copy: per-provider blurb + "get a key" link

components/
  SopWorkspace.tsx          # owns all state, wires everything together
  TopicInput.tsx            # the input bar, Import button, and privacy reminder
  VariableForm.tsx          # dynamic form generated from variables[]
  MarkdownPreview.tsx       # rendered/source tabs, live substitution
  ActionBar.tsx             # regenerate / add field / insert image / copy / export md, docx, pdf
  AddFieldDialog.tsx        # small popover form for custom variables
  ModelSelect.tsx            # provider-aware model dropdown (free text for Ollama)
  UpdatePanel.tsx             # header widget: check for updates / update now (self-hosted, git-based)
  DesktopUpdatePanel.tsx       # header widget: check for updates / update now (desktop, electron-updater)
  DesktopSettingsPanel.tsx      # header gear icon: change provider/model/key after setup
  DesktopOnboarding.tsx          # full-screen blocking first-run setup gate (desktop only)

types/sop.ts                 # SopDocument, SopVariable, VariableValues, LlmProvider

build/icon.png                # electron-builder's source icon — generates the .ico/.icns/.png set for every platform
app/icon.png                   # same image, Next.js's file-based favicon convention (auto-wired, no code)
public/logo.png                 # same image again, used directly in the header/onboarding <img>
```

### Why an adapter interface instead of one SDK

`LlmAdapter` is one method: `generate(systemPrompt, userPrompt) -> Promise<string>`. Each provider adapter builds its own request with **raw `fetch`** (no `openai` / `@google/generative-ai` packages) and returns the raw JSON text it got back, unvalidated. Parsing and schema validation happen once, centrally, in `app/api/generate/route.ts` — so swapping providers via `LLM_PROVIDER` never touches API-route or frontend code, and the dependency tree stays lean (no LLM SDKs at all).

Each adapter still gets the most reliable structured-output mechanism its provider offers:
- **OpenAI** — function-calling with `tool_choice` pinned to a single tool, so the only valid model output is well-formed arguments.
- **Gemini** — `generationConfig.responseSchema` + `responseMimeType: "application/json"`.
- **Ollama** — `format: "json"` plus the JSON Schema spelled out in the prompt itself, since local-model schema adherence varies. This is the adapter that leans hardest on `lib/sop/parseJson.ts`'s cleanup passes (strip code fences, slice a balanced `{...}` object out of surrounding prose, drop trailing commas) and `lib/sop/reconcile.ts`'s auto-repair (any `{{key}}` used in the markdown but missing from `variables[]` gets synthesized; any declared variable never referenced gets dropped).

All three route their request through `lib/llm/retry.ts#fetchWithRetry` — transient provider errors (429, 500/502/503/504, or a network failure) get up to 3 attempts with exponential backoff (honoring `Retry-After` if the provider sends one) before surfacing to the user; a 4xx like a bad key or bad request fails immediately since retrying it can't help. Reproduced live: Gemini returning "currently experiencing high demand" (503) on an otherwise-working setup — that's now retried transparently instead of requiring a manual re-click.

If a request still fails after retries, `lib/llm/humanizeError.ts` turns the status code + raw provider response into one clean, actionable sentence ("Gemini is temporarily unavailable — try again shortly" / "OpenAI rejected the API key. Check it in Settings." / etc.) instead of surfacing the provider's raw JSON error body. The raw body is preserved as the error's `cause`, logged server-side (`console.error` in `app/api/generate/route.ts`), and sent to the client as a separate `detail` field the error banner shows behind a collapsed "Show technical details" toggle — never dumped in the main message by default, but not lost either.

### Live preview without re-calling the API

`lib/sop/template.ts#renderTemplate` does the `{{key}}` substitution entirely client-side against local React state (`values`). Editing a form field or the raw Markdown source re-renders instantly — the API is only called on Generate/Regenerate.

### Two distributions, one app

`next.config.js` sets `output: "standalone"`, so `npm run build` always produces a pruned, self-contained `.next/standalone/server.js` alongside the normal build. Both distributions serve from that:

- **Self-hosted**: `scripts/supervisor.mjs` or systemd runs `next start` directly against the repo checkout — the git-based updater (`lib/update/`) applies here.
- **Desktop**: `electron/main.js` spawns `.next/standalone/server.js` as a child process and points a `BrowserWindow` at it. `UpdatePanel.tsx` (git-based) and `DesktopUpdatePanel.tsx`/`DesktopSettingsPanel.tsx` (Electron IPC-based) are both always rendered — each one detects its own environment (`isGitCheckout`/`window.electronAPI`) and renders nothing when it doesn't apply, so the same React tree serves both without branching logic in `SopWorkspace.tsx`.

Two non-obvious things worth knowing if you touch the packaging config (`package.json`'s `build` field):

- **`safeStorage` can hang the entire app.** Its calls are synchronous on Electron's single main-process thread; on a Linux box with a locked or misconfigured keyring, `isEncryptionAvailable()` was observed to simply never return — freezing the whole app, not just the settings dialog. `electron/safeStorageBridge.js` runs every `safeStorage` call in a disposable child process (this same executable, re-invoked with `--safestorage-helper`) with a hard timeout, falling back to unencrypted storage (with a console warning) rather than hanging if the keychain doesn't respond.
- **electron-builder silently drops any folder named exactly `node_modules`** at the root of an `extraResources`/`extraFiles` copy — a hardcoded rule in `builder-util`'s file-copy filter (`if (relative === "node_modules") return false`), meant to avoid double-copying the main app's own dependencies, with no way to override it via patterns. Since `.next/standalone`'s immediate child is literally `node_modules`, pointing `extraResources.from` straight at it silently produced a server bundle with no dependencies. `scripts/prepare-standalone.mjs` works around this by copying the finished standalone build one directory level deeper (`.next/pkg-src/app-server/`) before packaging, so `node_modules` is never the literal relative root the filter checks against.

## Quickstart (dev)

```bash
npm install
cp .env.example .env.local   # fill in the key for whichever provider you pick
npm run dev                  # http://localhost:3000
```

## Building the desktop app locally

```bash
npm run electron:start   # build + run unpacked, for quick iteration
npm run dist:linux       # AppImage + deb -> release/
npm run dist:win         # nsis installer -> release/ (best built on Windows)
npm run dist:mac         # dmg -> release/ (must be built on macOS, unsigned)
```

`npm run dist*` runs `next build` → `prepare-standalone.mjs` → `electron-builder`, `--publish never` by default so it never tries to upload anywhere. Actual releases are built and published by `.github/workflows/release.yml` on every `v*` tag push (all three platforms, via a build matrix — Windows and Mac can't be reliably cross-built from Linux).

## Self-hosted (advanced)

Skip this section unless you specifically want to run this on a server/always-on machine you control and access it via a browser, rather than using the desktop app above.

### Install

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
| `LLM_PROVIDER` | always | `openai` \| `gemini` \| `ollama` — default `gemini` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | `LLM_PROVIDER=openai` | model defaults to `gpt-5.6-terra` — see `lib/llm/modelOptions.ts` for current options |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | `LLM_PROVIDER=gemini` | model defaults to `gemini-3.6-flash` — see `lib/llm/modelOptions.ts` for current options |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | `LLM_PROVIDER=ollama` | no API key; point at a running `ollama serve`, defaults to `http://localhost:11434` / `llama3.1` |

## Releases

Tagged as `vX.Y.Z` on GitHub (semver, matching the `version` field in
`package.json`). Pushing a tag triggers `.github/workflows/release.yml`,
which builds and attaches the Windows/Mac/Linux installers plus the
`latest*.yml` metadata `electron-updater` reads to detect new versions.
See [Releases](https://github.com/bburge14/SOP/releases) for changelogs
and downloads. `scripts/install.sh` / `scripts/update.sh` (self-hosted
only) always track the `main` branch, not a specific release tag.

## Privacy & data handling

- **Only the topic string is ever sent to the AI provider.** `app/api/generate/route.ts` accepts `{ topic }` and nothing else — the values you type into the variable form (hostnames, IPs, credentials, anything site-specific) are substituted entirely client-side by `lib/sop/template.ts#renderTemplate` and never leave the browser/app unless you explicitly export/copy. `TopicInput.tsx` shows a standing reminder not to put proprietary, confidential, or personal information in the topic itself, since that string does go to a third party.
- **Nothing generated is persisted by the app.** Audited: no database, no `localStorage`/`sessionStorage`/IndexedDB use for SOP content (the only `localStorage` key anywhere is the self-hosted updater's optional auth token — see "Self-hosted" below — unrelated to generated content), and the only `fs.write*` calls in `electron/` are the PDF export (writes to a path *you* pick via a native save dialog) and the provider/API-key config file (settings, not SOP content). Server-side error logging (`console.error` in `app/api/generate/route.ts`) logs the exception only, never the topic or the generated document. Generated content lives in React state for the current session only — refreshing the page loses it, same as any unsaved browser tab; the only ways anything survives are the export/copy actions you take yourself.

## Notable behavior

- **Import** (upload icon next to Generate) loads a local `.md`/`.markdown`/`.txt`/`.docx` file straight into the same editing UI a generation produces — no AI call involved. The title is the file's first `# ` heading (falling back to the filename), and any `{{key}}` placeholders already in the file are auto-detected into editable fields via the same logic `handleTemplateChange` uses for hand-edited Source content. Lets you take a previously-exported (or hand-written) SOP and keep editing it. `.docx` files go through `lib/sop/docxToMarkdown.ts` (mammoth unzips the OOXML into HTML, `turndown`+GFM plugin turns that into the same markdown dialect the app renders) — importing a raw `.docx` used to just dump its zip bytes as text (`file.text()` on a binary file), caught from a real screenshot of the resulting garbage. To recover formatting a generic docx reader can't infer from direct formatting alone, `markdownToDocx.ts` now writes inline code / code blocks / blockquotes as named Word styles ("SOP Inline Code" etc.), which `docxToMarkdown.ts` maps back via a custom mammoth `styleMap`; documents from other tools (or older exports without these styles) still import fine, just without that extra fidelity. Verified round-trip via a compiled-standalone Node harness (mammoth's Node build + a `domino`-backed `DOMParser` shim) parsed back through the app's actual remark/remark-gfm stack: headings, bold/italic, inline code, fenced code blocks (multi-line — an early attempt silently dropped every line after the first because of how turndown reads `<pre><code>` content), GFM tables (mammoth emits plain `<td>` with no header signal, which makes turndown-plugin-gfm refuse to convert the table at all and fall back to raw un-rendered HTML — fixed by promoting row 0 to `<th>`; a second bug found the same way — cell content came back with embedded raw newlines from `<p>`-wrapped cells, which breaks GFM's one-line-per-row requirement — fixed with a custom cell rule), blockquotes, and embedded images all confirmed to parse as the correct AST node types, not just "looks similar" text.
- **Add Custom Field** adds a form field immediately; paste `{{your_key}}` into the Source tab to wire it into the document. Conversely, typing a new `{{key}}` directly into Source auto-creates its form field — the two directions are kept in sync in `SopWorkspace.tsx#handleTemplateChange`.
- **Export PDF**: on desktop, `electron/main.js`'s `export:pdf` IPC handler calls `webContents.printToPDF()` directly and writes the buffer to a file the user picks via a native save dialog — a real, text-searchable PDF, not a screenshot. Self-hosted (no `window.electronAPI`) falls back to the browser's native print dialog. Both render against the same `#print-target`-scoped print stylesheet in `app/globals.css`, which explicitly overrides the app's dark theme to a light/print-appropriate palette *and* cancels the live element's `h-full overflow-y-auto` scroll-container sizing so long content actually paginates instead of cropping to whatever fit in the visible scrolled viewport — reproduced live twice: first as the dark theme bleeding through (white-on-black), then — after fixing only the colors — as a real multi-section SOP getting cropped into a tiny scrollbar-bearing box with a blank second page. Verified properly the second time with an 8-section/48-step synthetic document in a deliberately small window: `printToPDF` produced a correctly-paginated 2-page PDF with every section present in order (`pdftotext`) and normal full-width layout (`pdftoppm`).
- **Export DOCX**: `lib/sop/markdownToDocx.ts` parses the rendered markdown with the same remark/unified stack the live preview uses and walks the AST into real `docx` structures — actual Word headings, numbered/bulleted lists (including one nesting level), GFM tables, bold/italic, code (shaded, monospace), blockquotes, and embedded images — not plain text in one style. Runs entirely client-side, same as Export .md, so nothing is sent anywhere for this. Verified by unzipping a real generated `.docx` (it's a zip of OOXML) and checking `word/document.xml` for the expected heading/bold/table/numbering elements, confirming `word/media/` contains the embedded image byte-identical to the source, and confirming the document title lives in `docProps/core.xml` metadata rather than as a duplicate visible heading (an actual bug caught this way: an unconditional title paragraph collided with the markdown's own `# H1`).
- **Insert Image** (ActionBar) reads a local image file, base64-encodes it as a `data:` URI, and appends it as a standard `![]()` markdown image to the template — no upload, no external hosting, consistent with nothing generated being persisted anywhere but the document itself. Works automatically in Preview and PDF export (both already render whatever's in the DOM, including `data:` image src) and in DOCX export (`markdownToDocx.ts` decodes the data URI directly into the embedded media file). 5MB cap per image.
- **Regenerate** discards current field values/edits after a confirm prompt, then re-runs the same topic through the pipeline.

<!-- last verified: install/update/uninstall lifecycle tested end-to-end -->
