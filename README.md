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
  api/analyze-import/route.ts # POST { document } -> { sop } | { error } — opt-in "Scan with AI" on an import
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
    prompt.ts               # system/user prompt builders (generation + import analysis)
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
    detectVariables.ts             # local heuristic pass: IPs/MACs/emails/etc -> {{key}} on import, no AI call
    remarkSubstituteVariables.ts    # AST-level {{key}} substitution for the live preview — tags each substituted
                                     # span with data-sop-var for hover-to-locate, no raw HTML injection
  providerInfo.ts             # onboarding copy: per-provider blurb + "get a key" link
  hooks/
    useOnClickOutside.ts        # shared close-on-outside-click for every popover/dropdown in the header/toolbar

components/
  SopWorkspace.tsx          # owns all state, wires everything together
  TopicInput.tsx            # the input bar, Import button, and privacy reminder
  VariableForm.tsx          # dynamic form generated from variables[]; hover a field to locate it in the preview
  MarkdownPreview.tsx       # rendered/source tabs, live substitution, hover-to-locate scroll+highlight
  MarkdownToolbar.tsx        # Bold/Italic/Heading/List/Table/Link buttons over the Source textarea
  ActionBar.tsx             # regenerate / add field / scan with AI / insert image / copy / export md, docx, pdf
  AddFieldDialog.tsx        # small popover form for custom variables
  ModelSelect.tsx            # provider-aware model dropdown (free text for Ollama)
  UpdatePanel.tsx             # header widget: check for updates / update now (self-hosted, git-based)
  DesktopUpdatePanel.tsx       # header widget: check for updates / update now (desktop, electron-updater)
  DesktopSettingsPanel.tsx      # header gear icon: change provider/model/key after setup
  PreferencesPanel.tsx           # header sliders icon: local display preferences (localStorage, not Electron IPC — works self-hosted too)
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

- **Only the topic string is ever sent to the AI provider — with one explicit, opt-in exception.** `app/api/generate/route.ts` accepts `{ topic }` and nothing else — the values you type into the variable form (hostnames, IPs, credentials, anything site-specific) are substituted entirely client-side by `lib/sop/template.ts#renderTemplate` and never leave the browser/app unless you explicitly export/copy. `TopicInput.tsx` shows a standing reminder not to put proprietary, confidential, or personal information in the topic itself, since that string does go to a third party. The one exception is the "Scan with AI" button (`app/api/analyze-import/route.ts`), which exists to let the AI read an *imported* document and parameterize it — that necessarily means sending the document's full rendered content, not just a topic. It's never called automatically; `SopWorkspace.tsx#handleAnalyzeWithAi` shows a `window.confirm` spelling out exactly that trade-off (and warning against proprietary content) before every single call, with no "don't ask again."
- **Nothing generated is persisted by the app.** Audited: no database, no `localStorage`/`sessionStorage`/IndexedDB use for SOP content (the only `localStorage` key anywhere is the self-hosted updater's optional auth token — see "Self-hosted" below — unrelated to generated content), and the only `fs.write*` calls in `electron/` are the PDF export (writes to a path *you* pick via a native save dialog) and the provider/API-key config file (settings, not SOP content). Server-side error logging (`console.error` in `app/api/generate/route.ts`) logs the exception only, never the topic or the generated document. Generated content lives in React state for the current session only — refreshing the page loses it, same as any unsaved browser tab; the only ways anything survives are the export/copy actions you take yourself.

## Notable behavior

- **Generation quality rules** (`SOP_SYSTEM_PROMPT` in `lib/llm/prompt.ts`) go beyond "produce a valid schema" to three specific, previously-observed failure modes — there's no reliable static way to catch these in code (no rule can detect "this hardcoded value should track that variable" or "this rollback step is fake"), so the fix lives entirely in the prompt text the model is given:
  - **No hardcoded values coupled to a variable.** If parameterizing a value (e.g. `{{external_port}}`) leaves some other line only correct for the default (e.g. a firewall policy's service hardcoded to `"HTTPS"`, which breaks the moment the port isn't 443), that dependent value must be parameterized too or phrased so it's derived from the variable at execution time.
  - **No redundant variables for one underlying value.** Never split a single physical value across multiple variables the user has to keep in sync by hand — e.g. `{{disk_name}}` + `{{partition_number}}` + `{{pv_device_path}}` for what's really one device path. One canonical variable holding the full value, reused everywhere it's needed.
  - **Rollback/cleanup steps must be real, executable commands** — never bracketed pseudocode like `delete [policy_id_assigned_to_{{policy_name}}]`. If a step needs a runtime-assigned ID, the rule requires the actual lookup command followed by the actual command using its result.
  - **Mandatory pre-flight safety checkpoint** for destructive/hard-to-reverse/broad-impact steps (partition/disk resizing, tenant-wide or broad access/firewall policy changes, deleting/replacing a resource) — prerequisites or step 1 must confirm something like a completed snapshot, a verified restorable backup, or working break-glass access exists *before* anything disruptive happens.

  The same redundancy/coupling rules (not the rollback/safety ones, which are about authoring new content — import analysis is explicitly forbidden from adding steps) are echoed in `IMPORT_ANALYSIS_SYSTEM_PROMPT`, and the `template_markdown`/`prerequisites` field descriptions in `lib/llm/schema.ts` reinforce the same points at the JSON-Schema level for providers that use structured output (OpenAI function-calling, Gemini `responseSchema`), since those field-level descriptions are literally what the model sees when filling that specific field. Verified live end-to-end against a real local model (Ollama, `qwen2.5-coder:7b`) rather than just confirming the prompt text: asked it to extend an LVM logical volume onto a new disk, and unprompted it used one canonical `{{new_disk_partition}}` variable (not three redundant ones), included a step 1 reading "Safety Checkpoint: Verify that a recent verified backup exists and is restorable before proceeding," and gave real `vgreduce`/`lvremove` rollback commands rather than pseudocode.
- **Import** (upload icon next to Generate) loads a local `.md`/`.markdown`/`.txt`/`.docx` file straight into the same editing UI a generation produces. Two layers of variable detection, both explained in more detail below: `lib/sop/detectVariables.ts` runs automatically, entirely locally (IPs, MAC addresses, emails, `<ALL_CAPS>` placeholder tokens, `____` blanks, `TBD`/`TODO`/etc. all get turned into `{{key}}` fields with the original value as the default), and the **Scan with AI** button is an explicit opt-in for a smarter pass that actually reads the document. The title is the file's first `# ` heading (falling back to the filename), and any `{{key}}` placeholders already in the file (from either detection layer, or already present in the source) are turned into editable fields via the same logic `handleTemplateChange` uses for hand-edited Source content. Lets you take a previously-exported (or hand-written) SOP and keep editing it. `.docx` files go through `lib/sop/docxToMarkdown.ts` (mammoth unzips the OOXML into HTML, `turndown`+GFM plugin turns that into the same markdown dialect the app renders) — importing a raw `.docx` used to just dump its zip bytes as text (`file.text()` on a binary file), caught from a real screenshot of the resulting garbage. To recover formatting a generic docx reader can't infer from direct formatting alone, `markdownToDocx.ts` now writes inline code / code blocks / blockquotes as named Word styles ("SOP Inline Code" etc.), which `docxToMarkdown.ts` maps back via a custom mammoth `styleMap`; documents from other tools (or older exports without these styles) still import fine, just without that extra fidelity. Verified round-trip via a compiled-standalone Node harness (mammoth's Node build + a `domino`-backed `DOMParser` shim) parsed back through the app's actual remark/remark-gfm stack: headings, bold/italic, inline code, fenced code blocks (multi-line — an early attempt silently dropped every line after the first because of how turndown reads `<pre><code>` content), GFM tables (mammoth emits plain `<td>` with no header signal, which makes turndown-plugin-gfm refuse to convert the table at all and fall back to raw un-rendered HTML — fixed by promoting row 0 to `<th>`; a second bug found the same way — cell content came back with embedded raw newlines from `<p>`-wrapped cells, which breaks GFM's one-line-per-row requirement — fixed with a custom cell rule), blockquotes, and embedded images all confirmed to parse as the correct AST node types, not just "looks similar" text.
- **Local variable detection** (`lib/sop/detectVariables.ts`) is deliberately conservative — high-confidence patterns only (IPv4, MAC, email, `<ALL_CAPS>` bracket tokens, `TBD`/`TODO`/`FIXME`/etc., `____` blank-fills), not a generic "anything bracketed" rule, since a broad bracket pattern would also catch markdown link text (`[label](url)`) and task-list checkboxes (`[ ]`/`[x]`). Same literal value found more than once maps to the same `{{key}}` everywhere it appears; the substitution pass sorts matches longest-first before a single combined-regex replace so one match can't corrupt another that's a substring of it (e.g. IP `10.0.0.1` inside `10.0.0.10`) — verified with exactly that case. Verified end-to-end with a real Playwright browser session (not just the pure function in isolation): imported a doc with an IP/email/bracket-token/blank-fill/pre-existing `{{key}}`, confirmed each became an editable field pre-filled with its real detected value (not blank), confirmed the rendered preview showed the real values rather than raw `{{key}}` text, and confirmed markdown links and GFM task-list checkboxes were left untouched.
- **Scan with AI** (ActionBar, `app/api/analyze-import/route.ts`) sends the imported document's full rendered content to the configured AI provider, which reads it and does the same job the local pass does but with actual understanding instead of regex — real judgment about which values are site/user-specific, not just ones that happen to look like an IP or an email. Reuses the exact same schema/parsing/reconciliation pipeline as `/api/generate` (`lib/llm/schema.ts`, `lib/sop/parseJson.ts`, `lib/sop/reconcile.ts`) with a different prompt (`IMPORT_ANALYSIS_SYSTEM_PROMPT` in `lib/llm/prompt.ts`) instructing the model to preserve wording/structure exactly and only insert `{{key}}` placeholders, with `variables[].default` set to the original value so the document still renders unchanged until you edit a field. This is the one deliberate exception to "only the topic is ever sent to the AI" (see "Privacy & data handling" above) — `window.confirm` spells that out before every call, no "don't ask again."
- **Formatting toolbar** (`MarkdownToolbar.tsx`, above the Source textarea) — Bold/Italic/Inline code/Heading 1-3/Bullet & numbered list/Blockquote/Table/Code block/Link buttons that operate on the textarea's current selection (wrap it, prefix each selected line, insert a snippet) rather than a separate rich-text document model, so there's no markdown<->rich-doc conversion to keep in sync with the rest of the app. List/heading buttons toggle off if the selection is already formatted that way. Verified with a standalone unit-test harness against the actual compiled functions (not reimplemented copies) — caught a real bug this way: numbered-list numbering skipped a number whenever the selection included a blank line, because the line index used for numbering counted blank lines too; fixed by only advancing the counter on non-blank lines. Also verified live in a browser: selecting text and clicking Bold/Heading 1/Table produced the expected markdown, and the edited document still rendered correctly (real `<strong>`/`<table>` elements) afterward.
- **Hover-to-locate**: hovering a field in the left Variables panel highlights and scrolls to its occurrence(s) in the Rendered preview; hovering a value in the Rendered preview always shows a tooltip naming which field it came from. The preview no longer renders a plain pre-substituted string — `lib/sop/remarkSubstituteVariables.ts` is a custom remark plugin that substitutes `{{key}}` at the mdast AST level (via `unist-util-visit` + mdast-util-to-hast's `data.hName`/`hProperties` convention, verified with a real remark→rehype pipeline that it produces genuine `<span data-sop-var="key" title="Field: Label">` elements in headings, paragraphs, list items, and table cells alike), not by injecting an HTML string — field values are user/import-controlled, and parsing them as raw HTML (`rehype-raw`) would be a real injection surface. The scroll+highlight direction can be turned off from the sliders icon in the header (`PreferencesPanel.tsx`, localStorage-backed, works in both self-hosted and desktop); the tooltip direction is always on since it's inert until hovered. Caught a real bug while verifying this live in a browser: the highlight-and-scroll effect originally used `Element.scrollIntoView()`, which per spec can scroll *every* scrollable ancestor to bring an element into view, not just the nearest one — reproduced with a Playwright session and a `MutationObserver`/scroll-event logger, it was nudging the whole page (including the left Variables panel, ~35-65px) while the mouse stayed at fixed screen coordinates, so mid-hover a *different* field row would end up under the cursor and the highlight would jump to the wrong field. Fixed by computing the target's offset and calling `scrollBy()` on `#print-target` directly, which can only ever affect that one container; reverified the left pane's row positions stay pixel-identical throughout the scroll.
- **Every popover closes on an outside click** (Preferences, the update panels, AI provider settings, Add Custom Field) via a shared `lib/hooks/useOnClickOutside.ts` — previously each stayed open until its own trigger button was clicked again. Listens on `pointerdown` rather than `click` and checks `element.contains(e.target)`, so a click on the trigger button itself (which lives inside the same wrapped container as the popover) is correctly treated as "inside" and doesn't fight with the button's own open/close toggle. Verified live for three of the five (Preferences, the self-hosted git UpdatePanel, Add Custom Field): opens on click, stays open when clicking inside its own content (including while typing into a field, confirming it doesn't lose a half-filled form), closes on an outside click without submitting anything, and the trigger button still toggles it closed normally.
- **Add Custom Field** adds a form field immediately; paste `{{your_key}}` into the Source tab to wire it into the document. Conversely, typing a new `{{key}}` directly into Source auto-creates its form field — the two directions are kept in sync in `SopWorkspace.tsx#handleTemplateChange`.
- **Export PDF**: on desktop, `electron/main.js`'s `export:pdf` IPC handler calls `webContents.printToPDF()` directly and writes the buffer to a file the user picks via a native save dialog — a real, text-searchable PDF, not a screenshot. Self-hosted (no `window.electronAPI`) falls back to the browser's native print dialog. Both render against the same `#print-target`-scoped print stylesheet in `app/globals.css`, which explicitly overrides the app's dark theme to a light/print-appropriate palette *and* cancels the live element's `h-full overflow-y-auto` scroll-container sizing so long content actually paginates instead of cropping to whatever fit in the visible scrolled viewport — reproduced live twice: first as the dark theme bleeding through (white-on-black), then — after fixing only the colors — as a real multi-section SOP getting cropped into a tiny scrollbar-bearing box with a blank second page. Verified properly the second time with an 8-section/48-step synthetic document in a deliberately small window: `printToPDF` produced a correctly-paginated 2-page PDF with every section present in order (`pdftotext`) and normal full-width layout (`pdftoppm`).
- **Export DOCX**: `lib/sop/markdownToDocx.ts` parses the rendered markdown with the same remark/unified stack the live preview uses and walks the AST into real `docx` structures — actual Word headings, numbered/bulleted lists (including one nesting level), GFM tables, bold/italic, code (shaded, monospace), blockquotes, and embedded images — not plain text in one style. Runs entirely client-side, same as Export .md, so nothing is sent anywhere for this. Verified by unzipping a real generated `.docx` (it's a zip of OOXML) and checking `word/document.xml` for the expected heading/bold/table/numbering elements, confirming `word/media/` contains the embedded image byte-identical to the source, and confirming the document title lives in `docProps/core.xml` metadata rather than as a duplicate visible heading (an actual bug caught this way: an unconditional title paragraph collided with the markdown's own `# H1`).
- **Insert Image** (ActionBar) reads a local image file, base64-encodes it as a `data:` URI, and appends it as a standard `![]()` markdown image to the template — no upload, no external hosting, consistent with nothing generated being persisted anywhere but the document itself. Works automatically in Preview and PDF export (both already render whatever's in the DOM, including `data:` image src) and in DOCX export (`markdownToDocx.ts` decodes the data URI directly into the embedded media file). 5MB cap per image.
- **Regenerate** discards current field values/edits after a confirm prompt, then re-runs the same topic through the pipeline.

<!-- last verified: install/update/uninstall lifecycle tested end-to-end -->
