# 📄 Text File Storage

A small, no-nonsense web app for saving, searching, and versioning plain-text files — straight from your browser.

No build step. No framework. No database. Just open a page and start writing.

Point it at a PHP server and it becomes a private, password-protected notebook you can reach from anywhere. Don't have a server handy? Open `index.html` straight from disk and it quietly falls back to your browser's own storage. Same UI, same features, either way.

---

## ✨ Why you might want this

- You want a scratchpad for text/data that isn't tied to Google Docs, Notion, or a note app you'll forget the password to.
- You want it to just work whether it's hosted on a real server or opened from a folder on your desktop.
- You want version history and a trash can, so "oops, I overwrote it" isn't a crisis.
- You want Markdown preview without shipping a 2.7 MB Markdown library to render three headings.
- You want an app you can actually read top to bottom in an afternoon.

## 🚀 Features

- **Save, edit, rename, retag** — title + tags + body, with a live preview of the filename it'll produce.
- **Full-text search** — type to filter by title instantly; hit `Enter` to search inside file contents, with highlighted snippets. `tag:work` filters by tag.
- **Version history** — every save snapshots the previous version. Browse it, preview it, restore it.
- **Trash, not delete** — deleted files go to a trash can for 30 days, with one-click Undo right on the toast.
- **Conflict detection** — editing the same file in two tabs? You'll get a clear choice instead of a silent overwrite.
- **Markdown preview** — toggle between raw text and rendered Markdown (tables, task lists, the works), sanitized against XSS.
- **Import / export** — drag `.txt` files or a JSON bundle onto the sidebar; export everything (or just your selection) in one click.
- **Autosaving drafts** — close the tab mid-edit, come back later, get your text back.
- **Offline-ready PWA** — installable, and the app shell loads even without a network.
- **Light / dark theme**, keyboard shortcuts, printable file view, and a bulk-select mode for cleaning house.

## 🧠 How it decides where to store things

On load, the app quietly checks whether a PHP backend is reachable and decides between two modes:

| Mode | Where files live | Password? |
| --- | --- | --- |
| **Server mode** | `datasets/*.txt` on your server | ✅ required |
| **Local mode** | Your browser's `localStorage` | ❌ none (it's just you) |

Both modes share the exact same features — search, versions, trash, drafts — through one common storage interface, so nothing feels like a second-class experience.

## 🏁 Getting started

### Option 1 — Just open it (local mode)

No install, no server, no password. Just:

```bash
open index.html
```

Your files live in your browser's storage. Great for trying it out or for personal, single-device use.

### Option 2 — Run the real thing (server mode)

You'll need PHP 7.3+.

```bash
php -S localhost:8000
```

Then open **http://localhost:8000/**. The first visit asks you to set a password — after that, every visit asks you to sign in. This mode gets you multi-device access, real persistence, and all your files behind a password.

You can also deploy it to any standard PHP host (Apache, IIS, nginx+php-fpm, etc.) — no dependencies to install, no `composer.json`, no database to provision.

## 🗂️ How it's organized

```
index.html            markup only — no inline script or style
api.php                front controller: routes every backend action
lib/*.php              backend modules (auth, storage, search, versions, trash…)
assets/js/*.js         front-end modules, loaded in dependency order
assets/css/*.css       stylesheets, linked in cascade order
assets/vendor/         marked.js (MIT) for Markdown parsing
sw.js + manifest        PWA shell for offline use
tests/                  npm test — structure + Markdown sanitizer checks
docs/                   deep-dive docs, including the full architecture writeup
```

Want the full architectural tour — the security model, the API reference, every design decision and known trade-off? It's all written up in [`docs/project-overview.md`](docs/project-overview.md). It's long, but it's the kind of long that answers your question before you finish typing it.

## 🔒 A few honest notes

- **Local mode has zero protection.** Anyone with access to that browser profile can read your files. It's a convenience fallback, not a vault.
- **Server mode is single-password, single-instance.** There are no user accounts — just one shared password for the whole app.
- **First-run setup is open until you set a password.** Set it immediately after deploying, or pre-create `config.php` yourself.

More detail on these (and the rest of the app's design trade-offs) is in the docs.

## 🧪 Running the tests

```bash
npm test
```

This checks the front-end module structure (no duplicate globals, correct load order) and runs 48 attack cases against the Markdown sanitizer, so a future `marked` upgrade can't quietly reopen an XSS hole.

## 📜 License

MIT — do what you like with it.
