# Project Overview — Text File Storage

A small, dependency-light web app for saving, viewing, editing, downloading, and deleting plain-text files. The front end is vanilla HTML/CSS/JS with no build step; it talks to a PHP backend when one is available and silently falls back to browser `localStorage` when it isn't.

## Purpose

Keep short text snippets / datasets in one place, reachable from a browser, with the same UI whether the page is served by a real web server or just opened from disk.

## Architecture

```
index.html  ──  style.css        static shell + styling
     │
  script.js                      all app logic; picks a storage backend at load
     │
     ├── Server mode ──> api.php ──> ./datasets/*.txt      (PHP, e.g. IIS or Apache)
     └── Local mode  ──> localStorage key "textFiles"      (browser only)

server.js (alternative, unused by the front end) ──> ./stored-files/*.txt
```

### Mode detection

On load, [script.js:19](../script.js:19) issues `GET api.php?action=ping`. A successful response switches the app to **Server Mode** (green banner); any error or non-OK response switches it to **Local Mode** (yellow banner). Every operation afterwards branches on the `isServerMode` flag, so each feature has two implementations — one HTTP, one `localStorage`.

## Components

| File | Role |
| --- | --- |
| [index.html](../index.html) | App shell: top bar (mode pill, theme toggle), sidebar file list with search, and an Edit/View tabbed panel. Plus a toast container and a confirmation dialog. |
| [script.js](../script.js) | All behavior. A `serverStore` / `localStore` adapter pair hides the backend difference behind `list / read / save / update / remove`, so each feature is written once. |
| [style.css](../style.css) | Design tokens for light and dark themes, two-column app layout, component styles, responsive breakpoints at 900 and 620 px, and a reduced-motion rule. |
| [api.php](../api.php) | JSON API over the `datasets/` directory. Actions: `ping`, `save`, `update`, `list`, `read`, `delete`. |
| [server.js](../server.js) | Express alternative backend over `stored-files/`. Routes: `POST /save-text`, `GET /files`, `GET /files/:filename`, `DELETE /files/:filename`. Serves `public/` as static. |
| [package.json](../package.json) | `text-storage-app`; single dependency `express`; `npm start` → `node server.js`. |

## PHP API reference (`api.php`)

All responses are JSON with a `success` boolean; failures add an `error` string.

| Action | Method | Parameters | Result |
| --- | --- | --- | --- |
| `ping` | GET | — | `{success: true}` — used for mode detection |
| `save` | POST | `filename`, `text` | Writes `datasets/<sanitized>.txt` |
| `update` | POST | `filename`, `text` | Overwrites an existing file; 404-style error if missing |
| `list` | GET | — | Array of `.txt` filenames |
| `read` | GET | `filename` | `{filename, content}` |
| `delete` | POST | `filename` | Unlinks the file |

Filenames given to `save` are sanitized with `[^a-zA-Z0-9_-] → _` and given a `.txt` suffix. The other actions pass the name through `basename()` before joining it to the storage directory.

## Features

- **Save** — filename + body. A live hint under the field previews the final name (`my notes!` → `my_notes_.txt`) and turns amber when sanitizing changed it. Saving over an existing name asks for confirmation first.
- **Browse** — sidebar list with a live search filter, a file count badge, and per-row Edit / Download / Delete buttons. Rows are keyboard-reachable; the selected file stays highlighted.
- **View** — content shown in a `<pre>` panel with Copy, Edit, and Download actions. Saving jumps straight to the View tab so the result is visible.
- **Edit** — loads content back into the form, locks the filename field, switches the button to "Update file", and shows Cancel.
- **Download** — content is wrapped in a `Blob` and saved through a synthetic `<a download>` click.
- **Delete** — a custom modal dialog naming the file; `Esc` or a backdrop click cancels.
- **Copy** — `navigator.clipboard.writeText`, with a `document.execCommand('copy')` fallback for older browsers.
- **Theme** — light/dark toggle, seeded from `prefers-color-scheme` and remembered in `localStorage` under `theme`.
- **Feedback** — toasts in the corner replace the old inline message bar; errors linger longer than successes.

### Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl`/`Cmd` + `S` | Save or update the current file |
| `Ctrl`/`Cmd` + `K` | Focus the search box |
| `Tab` (in the editor) | Insert a tab character instead of moving focus |
| `Esc` | Close the confirmation dialog |

Leaving the page with unsaved text in the editor triggers the browser's "leave site?" prompt.

## Storage layout

- Server mode: `datasets/` next to `api.php`, created on demand with mode `0755`.
- Node mode: `stored-files/` next to `server.js`, created on startup.
- Local mode: a single `localStorage` key `textFiles`, holding `{ "<name>.txt": { content, timestamp } }`.

`datasets/` is git-ignored (the entry appears twice in [.gitignore](../.gitignore)), so stored content never enters version control. `stored-files/` is not ignored.

## Running it

Server mode (PHP — the path the front end actually uses):

```bash
php -S localhost:8000
```

Then open `http://localhost:8000/index.html`. Any PHP-capable host works; the project was written with IIS/PHP in mind, per the mode banner text.

Node backend:

```bash
npm install && npm start
```

Local mode needs nothing at all — open `index.html` directly and the app falls back to `localStorage`.

## Notes and known gaps

- **The two backends are not interchangeable.** `script.js` only ever calls `api.php`. `server.js` uses different routes (`/save-text`, `/files`) and a different directory (`stored-files/`), and serves a `public/` folder that does not exist in the repo — so running `npm start` will not serve this UI as-is.
- **Empty content is rejected as an error** by both `save` and `update` in `api.php`, since they test with `empty()` — `"0"` is likewise rejected. The client blocks empty content up front in both modes so the two behave the same.
- **Stored text is never treated as markup.** Filenames and file content are put into the DOM with `textContent` and built through `createElement`, so a file containing `<script>` or a quote in its name renders literally instead of executing or breaking the row markup.
- **No authentication or authorization** on either backend; anyone who can reach the page can read, overwrite, or delete every stored file.
- **`.github/workflows/` is present but empty** — no CI configured.
