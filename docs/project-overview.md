# Project Overview — Text File Storage

A small, dependency-free web app for saving, viewing, editing, downloading, and deleting plain-text files. The front end is vanilla HTML/CSS/JS with no build step; it talks to a password-protected PHP backend when one is available and falls back to browser `localStorage` when it isn't.

## Purpose

Keep short text snippets / datasets in one place, reachable from a browser, with the same UI whether the page is served by a real web server or just opened from disk.

## Architecture

```
index.html  ──  assets/css/*.css   static shell + styling
     │
  assets/js/*.js                   app logic; picks a storage backend at boot
     │
     ├── Server mode ──> api.php ──> ./datasets/*.txt              (PHP 7.3+, session-authenticated)
     │                   + lib/*.php
     │                      ├─────> ./datasets/.versions/<name>/   prior revisions
     │                      ├─────> ./datasets-trash/              soft-deleted files
     │                      ├─────> ./config.php                   password hash
     │                      └─────> ./.auth/                       failed-login counters
     │
     └── Local mode  ──> localStorage: "textFiles"                 (browser only, no password)
                                      "textFilesTrash"
                                      "textFileVersions"
                                      "draft:*"
```

### Boot sequence

On load, `boot()` in [assets/js/boot.js](../assets/js/boot.js) calls `GET api.php?action=status`, which reports whether a password has been set and whether the current session is signed in. Three outcomes:

| Response | Result |
| --- | --- |
| Unreachable / not JSON | **Local mode** — browser storage, no gate |
| `configured: false` | **First-run setup** — `#setupGate`, the only screen that can create a password |
| `authenticated: false` | **Sign-in** — `#authGate`, one password field |
| Signed in | **Server mode**, CSRF token held in memory |

Both gates offer "Continue without signing in", which drops to local mode — so the app is still usable without the password, just against browser storage.

### Password surfaces

Three separate screens, deliberately not one form with a mode flag:

| Screen | When | Fields |
| --- | --- | --- |
| `#authGate` | Signing in | Password |
| `#setupGate` | First run only, before any password exists | New password, confirm |
| `#adminBackdrop` | Signed in, from the ⚙ button | Current + new + confirm, and a separate remove section |

They were one shared form once, and the setup fields leaked onto the sign-in card. [tests/structure.test.js](../tests/structure.test.js) now counts the password inputs in each (1 / 2 / 4) so they cannot merge back.

Creating the first password has to live outside the admin panel — the panel needs a session, and there is nothing to sign in with yet.

Every operation afterwards goes through the `serverStore` / `localStore` adapter pair, which share a five-method interface (`list`, `read`, `save`, `update`, `remove`). Features are written once against that interface rather than branching per backend.

## Layout

```
index.html                 markup only — no inline script or style
api.php                    front controller: constants, then the action router
lib/*.php                  backend modules, included by api.php
assets/js/*.js             front-end modules, loaded in order by index.html
assets/css/*.css           stylesheets, linked in cascade order
assets/vendor/             third-party: marked.min.js (MIT)
assets/icon.svg            app icon
sw.js  manifest.webmanifest  PWA shell
tests/                     npm test
docs/                      this file and the phase plan
```

### Front-end modules (`assets/js`)

Loaded as **classic scripts in dependency order**, not ES modules: modules are blocked by CORS on `file://`, and opening `index.html` straight from disk is a supported way to run the app. The cost is a shared global scope — [tests/structure.test.js](../tests/structure.test.js) fails the build if two modules declare the same top-level name.

| Module | Role |
| --- | --- |
| `core.js` | `el` references and `state`. Loaded first; everything else reads from it. |
| `stores.js` | `ApiError`, the fetch layer, and the `serverStore` / `localStore` pair. |
| `boot.js` | Mode detection and start-up sequencing. |
| `auth.js` | Sign-in, first-run setup, admin panel, sign-out — three separate surfaces. |
| `ui.js` | Toasts, confirm dialog, tab switching. |
| `list.js` | Sidebar: file list, trash list, search, tags, sorting. |
| `viewer.js` | View tab and version history. |
| `editor.js` | Edit tab, saving, conflict resolution. |
| `drafts.js` | Editor autosave. |
| `actions.js` | Download, copy, delete. |
| `transfer.js` | Import, export, migration, bulk selection. |
| `markdown.js` | Preview toggle, plus the sanitiser wrapping marked. |
| `app.js` | Theme, shortcuts, and the start-up calls. Loaded last. |

### Backend modules (`lib`)

`api.php` holds the constants and the action router; everything else lives in `lib/`, included before the router runs. Each module opens with `defined('TFS_APP') or exit;` so it cannot be executed by requesting it directly.

| Module | Role |
| --- | --- |
| `response.php` | `ok()` / `fail()` JSON helpers. |
| `session.php` | Session cookie configuration. |
| `settings.php` | Reads and writes the password config file. |
| `throttle.php` | Failed-login counters and lockout. |
| `auth.php` | Session state and CSRF tokens. |
| `store.php` | The only code that touches stored files. |
| `metadata.php` | Titles, tags, and the slug index. |
| `search.php` | Content and metadata search. |
| `versions.php` | Revision snapshots. |
| `trash.php` | Soft deletes and restore. |

### Stylesheets (`assets/css`)

Linked individually in cascade order: `tokens` → `layout` → `panel` → `markdown` → `overlays` → `components` → `auth` → `responsive` → `print`. Reordering the `<link>` tags changes the result; `tokens.css` must stay first and `print.css` last.

### Tests

| File | Covers |
| --- | --- |
| [tests/structure.test.js](../tests/structure.test.js) | Every module is referenced and exists, load order, no duplicate globals, `sw.js` and manifest paths, `lib/` guards. |
| [tests/markdown.test.js](../tests/markdown.test.js) | The markdown sanitiser: injection attempts against a DOM shim, plus allowlist coverage of marked's real output. |

```bash
npm test
```

## PHP API reference (`api.php`)

All responses are JSON with a `success` boolean; failures add an `error` string, a machine-readable `code`, and a matching HTTP status.

| Action | Method | Auth | CSRF | Result |
| --- | --- | --- | --- | --- |
| `status` | GET | — | — | `{configured, authenticated, csrf}` — drives the boot sequence |
| `ping` | GET | — | — | `{success: true}`; kept for older clients |
| `setup` | POST | — | — | Sets the password on first run, then signs in |
| `login` | POST | — | — | Verifies the password, starts a session, returns a CSRF token |
| `logout` | POST | ✓ | ✓ | Destroys the session |
| `password_change` | POST | ✓ | ✓ | Verifies `current`, stores the new hash, reissues the session |
| `password_remove` | POST | ✓ | ✓ | Verifies `current`, deletes `config.php`, ends the session |
| `list` | GET | ✓ | — | Files as `{name, title, tags, size, modified}` |
| `search` | GET | ✓ | — | `q` matched against titles, tags, names and contents; adds `{snippet, matches}` |
| `export` | GET | ✓ | — | Every file with its title, tags and content as one JSON bundle |
| `read` | GET | ✓ | — | `{filename, content, version, title, tags}` |
| `save` | POST | ✓ | ✓ | Takes `title` and optional `tags`; derives a free slug and indexes it |
| `update` | POST | ✓ | ✓ | Checks `base`, snapshots, overwrites; optional `title`/`tags` rename and retag. 409 on conflict |
| `delete` | POST | ✓ | ✓ | Moves the file to the trash, returns its trash `id` |
| `trash_list` | GET | ✓ | — | Trash entries `{id, name, deleted, size}`, newest first |
| `restore` | POST | ✓ | ✓ | Moves an entry back into storage, returns the final name |
| `trash_delete` | POST | ✓ | ✓ | Erases one entry and its revisions for good |
| `versions` | GET | ✓ | — | Revisions of a file `{stamp, saved, size}`, newest first |
| `version_read` | GET | ✓ | — | `{filename, stamp, content}` for one revision |

Error codes used by the client: `unauthenticated`, `csrf`, `bad_credentials`, `rate_limited`, `not_configured`, `already_configured`, `not_found`, `conflict`, `network`. A `conflict` response additionally carries `current` (the live content) and `version`.

### Security model

- **Password** — a single password, hashed with `password_hash` and stored in `config.php` (git-ignored, written `0600`). Created on the first-run screen, then managed from the admin panel. No password means no server access.
- **Changing it** requires the current password and is throttled like sign-in — holding a session is not licence to guess. A successful change regenerates the session ID and CSRF token, so every other session is signed out.
- **Session** — PHP session cookie, `HttpOnly` + `SameSite=Strict`, and `Secure` when the request arrives over HTTPS. The ID is regenerated at sign-in.
- **CSRF** — a 32-byte token issued at sign-in, held in memory by the client, sent as `X-CSRF-Token` and compared with `hash_equals` on every state-changing action.
- **Throttling** — 5 failed sign-ins per IP triggers a 5-minute lockout, tracked in `.auth/attempts.json`.
- **Path safety** — `store_path()` is the single gate: it applies `basename()`, rejects dotfiles and anything not ending in `.txt`, and every read/write/delete goes through it.

### Storage layer

No request handler touches the filesystem directly. Everything goes through `store_*` for live files, `index_*` for titles and tags, `versions_*` for revisions, and `trash_*` for soft deletes.

**Revisions.** `versions_snapshot()` runs before every overwrite — from both `save` and `update` — copying the outgoing content to `datasets/.versions/<slug>/<stamp>.txt`. Stamps look like `20260816-142530-9f3a`: sortable as strings, with a random suffix so two writes in one second cannot collide. Only the newest 20 per file are kept.

**Trash.** `delete` renames the file into `datasets-trash/` as `<stamp>__<original>.txt`, so the original name survives and repeated deletes of the same name never clash. Entries older than 30 days are purged whenever the trash is touched. Restoring into a name that is occupied produces `<name>-restored-2.txt` rather than overwriting the live file. Permanently deleting an entry also drops that name's revision directory — but only if no live file is using the name.

`store_list()` skips dotfiles, which is what keeps `.versions/` invisible to the file list.

### Naming and tags

The filesystem keeps a conservative slug; `datasets/.index.json` keeps the display title and tags. That split is what lets a file be called `Q3 planning (draft)` while living at `q3_planning_draft.txt` — titles keep spaces, punctuation, and non-Latin scripts, and two titles that reduce to the same slug land on separate files (`-2`, `-3`) instead of one clobbering the other.

**Renaming changes the title, never the slug.** Revisions and trash entries point at the slug, so moving it would orphan them. A file's on-disk name therefore reflects the title it was *created* with; the index is the source of truth for what the user sees.

`index_reconcile()` runs on every `list`: files dropped into `datasets/` by hand gain an entry titled after their filename, and entries whose file is neither live nor in the trash are pruned. Trashed files keep their entry so a restore keeps its title.

Tags live in the same index — up to 10 per file, lower-cased and de-duplicated, 24 characters each. Tag chips in the sidebar filter the list, and `tag:work` typed in the search box does the same. Both are client-side: tags arrive with `list`, so filtering costs no request.

### Markdown preview

The View tab toggles between raw text and a rendered view; the choice is remembered in `localStorage`.

Parsing is **marked v15** ([assets/vendor/marked.min.js](../assets/vendor/marked.min.js), MIT, 40 KB), vendored from the MarkdownReader project. That gives full GFM — tables, task lists, nested lists, autolinks, reference links, setext headings, strikethrough — which the earlier hand-written parser did not.

**marked does not sanitise.** Its own documentation points at DOMPurify, and it passes raw HTML through untouched: `<img src=x onerror=alert(1)>` in a stored file comes out of `marked.parse()` verbatim. Since files here are user content and can arrive from imported bundles, that would be a stored-XSS hole the moment someone opened the preview.

So marked's output never reaches the page directly:

1. `DOMParser` builds an **inert** document — no scripts run, no images load, nothing is attached to the live page.
2. `sanitizeNode()` walks it against an allowlist: unknown tags are unwrapped (keeping their text), dangerous ones (`script`, `style`, `iframe`, `svg`, `form`, …) are removed with their contents, and every attribute outside the per-tag allowlist is stripped — which removes every `on*` handler by construction.
3. `href` and `src` are checked by `isSafeUrl()`, which strips control characters *before* testing the scheme, so `java&#9;script:` is caught alongside `javascript:`. Only `http:`, `https:`, `mailto:`, and relative URLs survive.
4. The cleaned nodes are imported into the viewer. Nothing is ever assigned to `innerHTML` — a rule [tests/structure.test.js](../tests/structure.test.js) enforces across the whole front end.

Afterwards, tables are wrapped for horizontal scroll, links get `target="_blank"` + `rel="noopener noreferrer"`, and task-list checkboxes are disabled.

[tests/markdown.test.js](../tests/markdown.test.js) is mostly attacks — 48 cases covering scheme obfuscation, event handlers, `data:` URIs, smuggled classes, and tag injection — plus a coverage check that every tag and attribute marked actually emits is on the allowlist, so a marked upgrade cannot silently lose formatting.

**Not taken from MarkdownReader:** mermaid (2.7 MB, roughly 25× the rest of the app, and its generated SVG would have to bypass the sanitiser), FontAwesome, the Vazir fonts, and the PDF export. The RTL detection module is also unused here — worth revisiting if right-to-left content matters.

### Offline

`sw.js` caches the app shell — HTML, CSS, JS, manifest, icon — so the app opens without a network. It is registered only on HTTPS or localhost, and skipped entirely on `file://`.

**The worker never touches `api.php`.** Caching API responses would serve stale files, mask auth failures behind a cached `200`, and risk one session's data surfacing in another's cache. Requests to it always go to the network.

Bump `CACHE_VERSION` in `sw.js` when the shell changes, or returning clients keep serving the old bundle.

### Moving data in and out

**Export** produces a JSON bundle — `{format, version, exported, files: [{name, title, tags, modified, content}]}` — rather than a zip of `.txt` files. Titles and tags live outside the file content, so a zip would silently drop everything Phase 5 introduced. Bundles round trip losslessly.

**Import** accepts both: a `.json` bundle restores every entry with its metadata, and any other file becomes one entry titled after its filename. Files arrive by drag-and-drop onto the sidebar or through the Import button. Incoming titles that collide with existing ones prompt once — skip them, or bring them in as copies.

Import runs client-side, looping over `store().save()`, so it behaves identically in both modes and needed no new endpoint. The cost is one request per file.

**Migration** closes the gap between the two modes: signing in to a server while files remain in browser storage raises a toast offering to upload them, skipping any whose title is already on the server. A follow-up action clears the browser copies once they are safely across.

**Bulk selection** turns rows into checkboxes, with select-all, export-selected, and move-to-trash across the selection.

### Search

Two tiers, sharing one input:

- **Typing** filters the sidebar by filename, instantly and locally — no request.
- **Enter** searches inside the files. The server scans the directory with a regex carrying `/u`, so snippets cut on character boundaries; a file that is not valid UTF-8 falls back to a byte-wise match rather than disappearing from results. At this scale a plain scan beats an index and can never go stale.

Results replace the list until dismissed, each row showing a one-line snippet with the term marked. Filename-only matches are listed first, then by how often the term appears. Highlighting builds `<mark>` nodes rather than assembling HTML, so neither the search term nor file content can be interpreted as markup.

Refreshing, saving, or deleting while results are shown re-runs the search, so the list never points at files that have since changed.

### Concurrency

`read` returns a `version` token — a SHA-256 of the content, so a rewrite that changes nothing raises no false conflict and one-second filesystem timestamp resolution cannot hide a real change. `update` takes that token back as `base` and refuses the write with `409 conflict` when the stored content has moved on, returning the live content alongside.

The client tracks two tokens separately: `editBaseVersion` (what the editor's content started from) and `viewVersion` (what the viewer is showing). Keeping them apart matters — viewing a second file mid-edit would otherwise overwrite the editor's base and provoke a phantom conflict on the next save.

On conflict the user gets four choices, and nothing is discarded until they pick:

| Choice | Effect |
| --- | --- |
| **Keep my version** | Retries against the live token. The replaced content is snapshotted into History first, so it is not lost. |
| **Use the saved version** | Loads the live content into the editor and drops the draft. |
| **Open both** | Live content in the View tab, the user's text still in Edit. Both tokens advance, so a later save is a deliberate overwrite. |
| **Cancel** | Nothing is written; the text stays in the editor. |

`save` deliberately skips the check: creating a file over an existing name already asks for confirmation, so the intent to overwrite is explicit.

### Data safety

Four independent mechanisms mean no single action loses content:

| Mechanism | Protects against | Recovery |
| --- | --- | --- |
| Trash | Deleting the wrong file | Undo on the toast, or Restore from the Trash view, for 30 days |
| Revisions | Overwriting good content | History in the View tab; restoring writes a new revision, so it is itself undoable |
| Draft autosave | Crashes, closed tabs, expired sessions | Offered back on return |
| Version tokens | Two tabs or devices racing | Conflict dialog before anything is written |

Drafts are debounced to `localStorage` 600 ms after typing stops, in **both** modes, under `draft:<mode>:<filename>`. Reopening a file with a diverged draft prompts to restore it; an unsaved new file is offered back on next load. Saving or cancelling clears the draft. There is deliberately no `beforeunload` prompt — the draft is the protection, and the prompt fired even when nothing was worth keeping.

## Features

- **Save** — title + tags + body. A live hint previews the slug the title will produce. Saving under a title that already exists offers to replace that file rather than creating a confusing twin.
- **Rename / retag** — edit the title or tags while editing the file; both are written with the content on update.
- **Browse** — a Files / Trash segmented control with counts, per-row actions, and a size + relative-modified line under each name. Rows are keyboard-reachable; the selected file stays highlighted.
- **Sort** — by recently changed (default), title (natural order, so `file10` follows `file9`), or size.
- **Search** — title filtering as you type; `Enter` searches file contents and shows snippets with the term highlighted. `tag:work` filters by tag.
- **Tags** — chips above the list toggle a filter, each showing how many files carry that tag.
- **Import / export** — drag `.txt` files or a bundle onto the sidebar, or use the Import button; Export downloads everything (or just the selection) as one JSON bundle.
- **Bulk actions** — Select turns the list into checkboxes for export or move-to-trash across many files.
- **View** — content shown in a `<pre>` panel with Copy, Edit, Download, and History actions. Saving jumps straight to the View tab so the result is visible.
- **Edit** — loads content back into the form, locks the filename field, switches the button to "Update file", and shows Cancel.
- **History** — lists earlier revisions with relative times and sizes. Selecting one previews it behind an amber banner offering **Restore this version** or **Back to current**.
- **Download** — content is wrapped in a `Blob` and saved through a synthetic `<a download>` click.
- **Delete** — a confirmation dialog, then a move to the trash with an **Undo** button on the toast.
- **Trash** — deleted files with the time they went in, each restorable or erasable for good. Purged after 30 days.
- **Drafts** — the editor buffer autosaves; a "Draft saved" flag appears beside the counter, which shows words, characters, lines, and reading time past 200 words.
- **Markdown** — a toggle in the View tab renders the file instead of showing raw text; the preference sticks.
- **Print** — printing gives the open file's content and title alone; the chrome is stripped and markdown links print their URLs.
- **Offline** — installable as a PWA, and the shell opens without a network.
- **Copy** — `navigator.clipboard.writeText`, with a `document.execCommand('copy')` fallback for older browsers.
- **Theme** — light/dark toggle, seeded from `prefers-color-scheme` and remembered in `localStorage` under `theme`.
- **Feedback** — toasts in the corner replace the old inline message bar; errors linger longer than successes.
- **Sign in / out** — a full-screen gate on first load in server mode, with a sign-out button in the top bar. An expired session reopens the gate mid-session rather than failing with a bare error.

### Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl`/`Cmd` + `S` | Save or update the current file |
| `Ctrl`/`Cmd` + `K` | Focus the search box |
| `Enter` (in search) | Search inside file contents |
| `Tab` (in the editor) | Insert a tab character instead of moving focus |
| `Esc` | Close the confirmation dialog |

Shortcuts are inert while the sign-in gate is open. Leaving the page mid-edit is safe — the draft is kept.

## Storage layout

**Server mode** — everything sits beside `api.php`:

| Path | Contents |
| --- | --- |
| `datasets/` | live `.txt` files, created on demand with mode `0755` |
| `datasets/.index.json` | display titles and tags, keyed by slug |
| `datasets/.versions/<slug>/` | up to 20 revisions per file, named `<stamp>.txt` |
| `datasets-trash/` | soft-deleted files, named `<stamp>__<original>.txt` |
| `config.php` | password hash, written `0600` |
| `.auth/attempts.json` | failed-login counters |

**Local mode** — four `localStorage` keys: `textFiles` (`{ "<name>.txt": { content, timestamp } }`), `textFilesTrash`, `textFileVersions`, and one `draft:<mode>:<filename>` per in-progress edit. The browser adapter implements trash and revisions too, so both modes offer the same recovery paths.

[.gitignore](../.gitignore) excludes `datasets/`, `datasets-trash/`, `config.php`, and `.auth/`, so neither stored content nor the password hash enters version control.

## Running it

Serve the folder with any PHP 7.3+ host — IIS, Apache, or the built-in server:

```bash
php -S localhost:8000
```

Open `http://localhost:8000/`. The first load asks you to set a password; after that it asks you to sign in.

Local mode needs nothing at all — open `index.html` directly and the app falls back to `localStorage`, no password involved.

## Notes and known gaps

- **First-run setup is unauthenticated by design.** Until a password is set, anyone who reaches `api.php` can set it. Complete setup immediately after deploying, or pre-create `config.php` by hand.
- **Removing the password re-opens that window.** It does not expose the files — every action still needs a session and nobody holds one — but it returns the server to the unclaimed state above, so the next visitor can set a password and reach everything. The admin panel says so and requires the current password first.
- **Single password, no accounts.** There is one credential for the whole instance and no per-file ownership.
- **Sessions are the only state.** There is no "remember me" and no token refresh; closing the browser signs you out.
- **Local mode has no protection at all** — anyone with access to the browser profile can read the files. It is a convenience fallback, not a private store.
- **Stored text is never treated as markup.** Filenames and file content are put into the DOM with `textContent` and built through `createElement`, so a file containing `<script>` or a quote in its name renders literally instead of executing or breaking the row markup.
- **Empty content is still rejected** by `save` and `update`; the client blocks it up front in both modes so they behave alike. A body of `"0"` is now accepted, which the old `empty()` check refused.
- **Conflict detection covers `update`, not `delete`.** Deleting a file someone else just changed still succeeds — the content goes to the trash, so it is recoverable, but nobody is warned.
- **A slug reflects the title a file was created with, not its current one.** Renaming leaves the on-disk name alone, so `q3_planning_draft.txt` may end up titled "Q4 review". This is deliberate — remapping the slug would orphan its revisions and trash entries — but it does mean the directory is not self-describing.
- **The index is a single JSON file with no locking beyond `LOCK_EX`.** Two writes landing at the same instant can lose one's title change; the content itself is safe, since that goes through the versioned write path.
- **Tags are flat and free-text.** No hierarchy, no rename-a-tag-everywhere, no autocomplete — a typo makes a new tag.
- **Offline means the shell, not the files.** Opening the app without a network gives you the interface and whatever is in browser storage; server-mode files are not available offline, and there is no queue for edits made while disconnected.
- **Test coverage is the file layout and the markdown sanitiser, nothing else.** `npm test` catches a broken script tag or a regressed allowlist; it does not exercise storage, auth, or any behaviour.
- **The sanitiser is the only thing between marked and the page.** It has been tested against a shim, but never run in a browser — see the standing note about untested code below. A bug there is an XSS bug.
- **marked is vendored, not tracked.** Upgrading means copying a new `marked.min.js` in by hand and re-running `npm test`; nothing checks the version or watches for advisories.
- **The front end shares one global scope.** That is the price of classic scripts, which is the price of `file://` support. A structural test catches collisions, but nothing prevents a module reaching into another's internals.
- **Import is one request per file.** Fine for tens, slow for thousands, and there is no progress indicator or cancel — a large bundle looks like a hang until the summary toast appears.
- **Export holds everything in memory** on both sides: the server builds the whole bundle as one array, and the client stringifies it in one go.
- **Bundles carry no revision history or trash.** Exporting and reimporting gives you current content, titles, and tags — the past is left behind.
- **Migration is one-way.** There is no server-to-browser sync, and uploaded files are copies, not links; editing one afterwards does not touch the other.
- **Search reads every file on every query.** Fine at a few hundred files; it will need an index long before it needs anything else.
- **Search covers live files only** — not the trash, and not revision history.
- **Local mode versions are stamps, not hashes.** The browser adapter tags each write with a new stamp rather than hashing content, so rewriting a file with identical text still counts as a change there. Tokens are opaque and never cross between modes, so the two schemes coexist.
- **Revisions and trash share the storage quota.** Twenty revisions of a large file cost twenty times its size, and local mode spends browser quota on full copies of every version and trashed file. Neither mode reports quota pressure yet.
- **Drafts are per-browser, not per-account.** A draft written on one machine is not offered on another, even in server mode.
- **Restoring a trashed file does not restore its position** — if the name was reused, the restored copy is suffixed, and nothing links the two.
- **`.github/workflows/` is present but empty** — no CI configured.
