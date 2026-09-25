# Version 3 — Phased Plan

**Theme:** make the app trustworthy. v1 stored text, v2 made it pleasant to use. v3 makes it safe to put on a network and safe to keep real content in.

Everything here builds on the current stack — vanilla front end, PHP backend, `localStorage` fallback. No framework, no build step.

---

## Phase 0 — Consolidate

Clear the ground before adding anything. Small, low-risk, unblocks everything after it.

### 0.1 Pick one backend

`server.js` is dead code: the front end only ever calls `api.php`, and the Express routes (`/save-text`, `/files`), the directory (`stored-files/`), and the `public/` folder it serves don't match anything in the repo.

**Decision:** keep PHP, delete [server.js](../server.js). Rationale — it is the backend the client actually talks to, and it deploys on IIS/shared hosting without a runtime. If Node is preferred instead, port `api.php` to it and delete the PHP file; what matters is that only one survives.

Follow-on cleanup:
- Drop the `express` dependency and the `start` script from [package.json](../package.json), or repoint them.
- Remove the duplicate `/datasets` line in [.gitignore](../.gitignore); add `/datasets-trash` ahead of Phase 2.
- Update [project-overview.md](project-overview.md) to drop the two-backend section.

**Done when:** the repo has exactly one server implementation and `npm start` either works or no longer exists.

### 0.2 Storage layer boundary

Every file operation in `api.php` currently inlines its own path building and validation. Pull them behind a small set of internal functions (`store_list`, `store_read`, `store_write`, `store_delete`) before Phases 1–3 start adding metadata, trash, and revisions on top. Client-side, the `serverStore` / `localStore` adapter pair (now in [assets/js/stores.js](../assets/js/stores.js)) is already the right shape — keep new features behind that same five-method interface so both modes stay in step.

**Done when:** no route handler in the backend touches `file_put_contents` or a path concatenation directly.

---

## Phase 1 — Authentication

The highest-value change in the release. Right now anyone who can reach the URL can read, overwrite, and delete every stored file.

### Scope

Single-user password auth. Not accounts, not roles, not OAuth — those are a different product.

- A password hash in a config file outside the web root (or in an env var), created with `password_hash`.
- `POST action=login` verifies with `password_verify`, starts a PHP session, and sets an `HttpOnly` + `SameSite=Strict` cookie. `Secure` when served over TLS.
- Every action except `ping` and `login` rejects unauthenticated requests with a clear error.
- `POST action=logout` destroys the session.
- Rate-limit failed logins (a counter file keyed by IP, backing off after ~5 attempts) so the password isn't brute-forceable.

### Client

- A login screen shown when the app boots and gets an unauthenticated response.
- On any `401`-equivalent mid-session, drop back to the login screen instead of firing a toast — the current error path would just say "Request failed."
- A logout control in the top bar next to the theme toggle.

### CSRF

Once a session cookie exists, the POST actions become forgeable from another origin. Issue a token at login, store it in `sessionStorage`, send it as a header, and compare with `hash_equals` server-side.

### Local mode

Unaffected — there is no server to authenticate against, and the data never leaves the browser. Keep the mode pill honest about that distinction.

**Done when:** a logged-out browser can reach nothing but `ping` and `login`, and a cross-origin form POST to `action=delete` fails.

---

## Phase 2 — Don't lose data

Three independent changes, shippable in any order. Together they mean no single mistake destroys content.

### 2.1 Soft delete

`delete` moves the file to `datasets-trash/` with a timestamp prefix instead of calling `unlink`. Add `action=trash_list` and `action=restore`; purge entries older than 30 days on write. The UI gets a "Trash" view in the sidebar and an **Undo** action on the delete toast.

### 2.2 Revision history

Before every `update`, copy the current content to `datasets/.versions/<name>/<timestamp>.txt`. Add `action=versions` (list) and `action=version_read`. In the View tab, a history dropdown lists prior versions with their timestamps; selecting one previews it, with a **Restore** button that writes it back as a normal update — so restoring is itself undoable.

Cap at ~20 revisions per file, pruning oldest first, so the directory can't grow without bound.

### 2.3 Draft autosave

Debounce the editor buffer into `localStorage` under a `draft:<filename>` key, in **both** modes. On load, if a draft exists that differs from the saved file, offer to restore it. Clear the draft on successful save.

This replaces the current `beforeunload` prompt as the real protection — that prompt is a seatbelt, not a fix, and it fires even when there's nothing worth keeping.

**Done when:** deleting a file can be undone, any prior version of a file can be restored, and killing the browser tab mid-edit loses nothing.

---

## Phase 3 — Concurrency

Two tabs editing the same file silently lose one version; last write wins with no warning.

- `read` returns an `mtime` (or a content hash) alongside the content.
- `update` requires that value back and rejects the write when it no longer matches, returning the current server content.
- The client shows a conflict dialog: **Keep mine** / **Keep theirs** / **Open both** (loads the server copy into the viewer, keeps the local copy in the editor).

Small phase, but it has to land before multi-device use is realistic.

**Done when:** two tabs editing the same file cannot silently overwrite each other.

---

## Phase 4 — Find things

### 4.1 Full-text search

Search currently filters filenames only, which stops being useful past roughly thirty files. Add `action=search&q=…` that scans file contents server-side and returns matches with a surrounding snippet. At this scale a plain loop over the directory is fine — no index needed until it visibly lags.

The existing search box gains a mode: filenames as you type (instant, client-side), contents on `Enter` (server round-trip). Highlight the matched term in the results list.

In local mode the same search runs over the `localStorage` store, so behavior matches.

### 4.2 Metadata and sorting

`list` currently returns bare filenames. Return `{name, size, modified}` per entry, and add sort controls: **Modified** (default), **Name**, **Size**. Show relative modified time in each row.

**Done when:** a user can find a file by something they remember writing in it, and can sort by recency.

---

## Phase 5 — Naming and organisation

### 5.1 Fix the filename model

`my notes!` becomes `my_notes_.txt` — lossy, and two distinct titles can collide onto one file. Introduce a metadata index (`datasets/.index.json`) mapping the on-disk slug to a display title. The UI shows and searches the title; the filesystem keeps the safe slug. Detect slug collisions and suffix them (`-2`, `-3`).

This also lets titles carry spaces, punctuation, and non-Latin scripts — worth doing before people accumulate files under mangled names.

### 5.2 Tags

Tags in the same index, rather than real folders — less to implement, no path handling, no traversal surface. Sidebar filter chips; `tag:work` syntax in the search box.

**Done when:** a file's display name survives round-tripping, and files can be filtered by tag.

---

## Phase 6 — Move data around

The two storage modes are currently sealed silos — content saved in browser mode has no path to the server.

- **Import:** drag `.txt` files onto the sidebar to create them. Multi-file supported.
- **Export:** download all files as a single `.zip` (server mode) or JSON bundle (both modes).
- **Push local → server:** when the app is in server mode and `localStorage` still holds files, offer to upload them, with per-file conflict handling.
- **Bulk actions:** multi-select rows for download and delete.

**Done when:** files created offline can be moved onto the server without copy-paste.

---

## Phase 7 — Polish

Lower priority; each is independently shippable.

- **Markdown preview** — a toggle in the View tab. Natural fit for a plain-text tool.
- **PWA** — a manifest and a service worker make it installable and genuinely offline-capable, which suits a project named "Local text storage."
- **Word/reading-time counts** alongside the existing character and line counters.
- **Print stylesheet** for the viewer.

---

## Cross-cutting: CI and tests

`.github/workflows/` exists but is empty. Once Phase 0 settles on one backend, add a workflow that runs on every push:

- Lint the front end and the backend (`php -l` or ESLint).
- API tests covering `save`, `read`, `update`, `delete`, plus the new trash, versions, and conflict paths.
- A guard that fails the build if `innerHTML` reappears anywhere in `assets/js/` — the DOM-safe rendering rule is easy to regress.

The storage layer is exactly where a silent regression eats user files, so this is worth its cost from Phase 2 onward.

---

## Suggested order

| Phase | Blocks | Status |
| --- | --- | --- |
| 0 — Consolidate | everything | **done** |
| 1 — Authentication | public deployment | **done** |
| 2 — Don't lose data | — | **done** |
| 3 — Concurrency | multi-device use | **done** |
| 4 — Find things | — | **done** |
| 5 — Naming | 6 (import needs the index) | **done** |
| 6 — Move data | — | **done** |
| 7 — Polish | — | **done** |

**All seven phases have shipped.** See [project-overview.md](project-overview.md) for how they landed. Deviations from the plan as written:

- The browser-storage adapter implements trash, revisions, conflict detection, and search too, rather than showing a disabled state.
- The `beforeunload` prompt was removed outright once drafts made it redundant.
- The conflict token is a content hash rather than an mtime, and the dialog gained a fourth option (Cancel) so the user can back out without choosing a side.
- Sorting happens client-side. `list` returns metadata and the sidebar sorts it, which keeps sort changes instant and the server simpler.
- Renaming and retagging fold into `update` rather than getting their own endpoints, so a rename is atomic with the content write it accompanies.
- Renaming deliberately does **not** re-slug the file: revisions and trash entries key off the slug, so remapping it would orphan them.
- Export is a JSON bundle in both modes, not a zip. A zip of `.txt` files cannot carry the titles and tags Phase 5 introduced, and hand-rolling a zip writer to no benefit was not worth it.
- Import needed no endpoint: it loops over `save()` client-side, so one implementation serves both modes.
- The markdown renderer is hand-written rather than pulled in, since no external script may be loaded and it had to build nodes instead of HTML. Single-underscore emphasis is omitted on purpose — snake_case slugs are everywhere in this app.
- Phase 7 also picked up the first automated test (`npm test`), covering the renderer's grammar and its injection cases. That was listed under cross-cutting work, not Phase 7, but the renderer is the one piece where a silent regression would be an XSS hole.

## Post-v3 cleanup

After Phase 7 the three source files had grown past the point of comfortable reading — `script.js` 2665 lines, `api.php` 1244, `style.css` 1119. They were split along their existing section boundaries into `assets/js/` (13 modules), `lib/` (10 modules), and `assets/css/` (9 stylesheets), with `index.html` and `api.php` reduced to markup and routing.

The split was mechanical and verified: every code line of the originals appears exactly once in the new files, and `npm test` now checks the layout itself — references resolve, load order holds, no two modules declare the same global, `sw.js` and the manifest point at files that exist, and `innerHTML` stays out of the front end.

The one design constraint worth restating: the front end uses **classic scripts, not ES modules**, because modules are blocked by CORS on `file://` and opening `index.html` from disk is supported. Modules therefore share a global scope, which the structural test polices.

## What is left

Nothing from the v3 plan. The open items are the ones recorded in the project overview's known gaps — chiefly that **`api.php` has never been executed**: PHP is not installed on the development machine, so roughly 1250 lines of backend across all seven phases have had no lint and no runtime test. That is the single largest risk in the project and should be closed before any deployment.

Beyond that, the cross-cutting CI work is still open: only the markdown renderer has automated coverage, and `.github/workflows/` remains empty.

**Minimum viable v3:** Phases 0, 1, 2, and 4.1. That's auth, revision history, soft delete, drafts, and content search — enough to call it a tool you'd keep real notes in. Everything after that is upside.

## Risks to watch

- **Hidden directories inside `datasets/`.** Trash and versions add `.versions/` and a `.index.json`; `list` filters on the `.txt` extension today, but any new listing code must not expose them.
- **Path handling.** Every new action that accepts a filename needs the same `basename()` treatment the current ones use — restore and version-read are the easy ones to forget.
- **Index drift.** Once `.index.json` exists, files added to `datasets/` by hand won't appear. Fall back to the filesystem listing and reconcile on load.
- **Feature parity between modes.** Search, trash, and versions all need a `localStore` implementation or a clearly disabled state — the adapter pair makes this cheap, but only if it isn't bypassed.
