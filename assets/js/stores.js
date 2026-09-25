/* ============================================
   stores.js — Storage adapters and the HTTP layer.

   serverStore and localStore expose the same interface, so each feature is
   written once. store() returns whichever mode is active.
   ============================================ */

const LS_KEY = 'textFiles';
const LS_TRASH = 'textFilesTrash';
const LS_VERSIONS = 'textFileVersions';

const MAX_VERSIONS = 20;
const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readJson(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || '{}');
    } catch (e) {
        return {};
    }
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function readStore() {
    return readJson(LS_KEY);
}

function writeStore(files) {
    writeJson(LS_KEY, files);
}

/** Matches the server's stamp format: 20260816-142530-9f3a */
function newStamp() {
    const d = new Date();
    const p = (n, w = 2) => String(n).padStart(w, '0');
    const rand = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
        `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${rand}`;
}

/**
 * Derives a filesystem-safe slug from a display title. `taken` is the set of
 * slugs already in use, so two different titles reducing to the same slug
 * land on separate files instead of one clobbering the other.
 */
function slugFromTitle(title, taken = {}) {
    let base = title.replace(/[^a-z0-9_-]/gi, '_').replace(/_{2,}/g, '_').replace(/^[_-]+|[_-]+$/g, '');
    if (!base) base = 'file';
    base = base.slice(0, 60);

    let slug = base + '.txt';
    let n = 2;
    while (taken[slug] && n < 1000) {
        slug = `${base}-${n}.txt`;
        n++;
    }
    return slug;
}

/** Preview of the slug a title will produce, ignoring collisions. */
function sanitizeName(title) {
    return slugFromTitle(title);
}

function normalizeTags(raw) {
    const seen = [];

    (Array.isArray(raw) ? raw : String(raw || '').split(','))
        .forEach((tag) => {
            const clean = String(tag).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 24);
            if (clean && !seen.includes(clean) && seen.length < 10) seen.push(clean);
        });

    return seen;
}

function titleDefault(slug) {
    return slug.replace(/\.txt$/, '');
}

/** The name to show a user for a slug — its title when we know one. */
function displayName(filename) {
    const live = state.files.find((f) => f.name === filename);
    if (live) return live.title || titleDefault(filename);

    const trashed = state.trash.find((t) => t.name === filename);
    if (trashed) return trashed.title || titleDefault(filename);

    return titleDefault(filename);
}

/**
 * Error carrying the server's machine-readable `code`, so callers can tell
 * "wrong password" from "session expired" from "disk is full".
 */
class ApiError extends Error {
    constructor(message, code, data) {
        super(message);
        this.code = code || '';
        this.data = data || null;      // conflict responses carry the live content
    }
}

async function request(url, options = {}) {
    let data;
    try {
        const response = await fetch(url, options);
        data = await response.json();
    } catch (e) {
        throw new ApiError('Could not reach the server.', 'network');
    }

    if (!data || !data.success) {
        throw new ApiError((data && data.error) || 'Request failed.', data && data.code, data);
    }
    return data;
}

function apiGet(params) {
    return request('api.php?' + new URLSearchParams(params).toString());
}

function apiPost(action, fields = {}) {
    const body = new FormData();
    body.append('action', action);
    Object.entries(fields).forEach(([k, v]) => body.append(k, v));

    const headers = {};
    if (state.csrf) headers['X-CSRF-Token'] = state.csrf;

    return request('api.php', { method: 'POST', body, headers });
}

/**
 * Wraps a store call so an expired session sends the user back to the gate
 * instead of surfacing a bare "Please sign in" toast.
 */
async function guarded(promise) {
    try {
        return await promise;
    } catch (error) {
        if (error.code === 'unauthenticated' || error.code === 'csrf') {
            state.csrf = '';
            openAuthGate('login', 'Your session expired. Please sign in again.');
        }
        throw error;
    }
}

const serverStore = {
    async list() {
        return (await guarded(apiGet({ action: 'list' }))).files;
    },
    async search(q) {
        return (await guarded(apiGet({ action: 'search', q }))).results;
    },
    async read(filename) {
        const data = await guarded(apiGet({ action: 'read', filename }));
        return {
            content: data.content,
            version: data.version,
            title: data.title || titleDefault(filename),
            tags: data.tags || []
        };
    },
    async save(title, text, tags = []) {
        const data = await guarded(apiPost('save', { title, text, tags: tags.join(',') }));
        return {
            filename: data.filename,
            version: data.version,
            title: data.title,
            tags: data.tags || []
        };
    },
    async update(filename, text, base = '', meta = {}) {
        const fields = { filename, text, base };
        if (meta.title !== undefined) fields.title = meta.title;
        if (meta.tags !== undefined) fields.tags = meta.tags.join(',');

        const data = await guarded(apiPost('update', fields));
        return {
            filename: data.filename,
            version: data.version,
            title: data.title,
            tags: data.tags || []
        };
    },
    async remove(filename) {
        return (await guarded(apiPost('delete', { filename }))).id;
    },

    async listTrash() {
        return (await guarded(apiGet({ action: 'trash_list' }))).entries;
    },
    async restore(id) {
        return (await guarded(apiPost('restore', { id }))).filename;
    },
    async destroyTrash(id) {
        await guarded(apiPost('trash_delete', { id }));
    },

    async listVersions(filename) {
        return (await guarded(apiGet({ action: 'versions', filename }))).versions;
    },
    async readVersion(filename, stamp) {
        return (await guarded(apiGet({ action: 'version_read', filename, stamp }))).content;
    }
};

/** Copies the current content of a file into its revision list. */
function localSnapshot(filename) {
    const files = readStore();
    if (!files[filename]) return;

    const all = readJson(LS_VERSIONS);
    const list = all[filename] || [];

    list.unshift({
        stamp: newStamp(),
        saved: Math.floor(Date.now() / 1000),
        content: files[filename].content
    });

    all[filename] = list.slice(0, MAX_VERSIONS);
    writeJson(LS_VERSIONS, all);
}

function localVersionsDestroy(filename) {
    const all = readJson(LS_VERSIONS);
    delete all[filename];
    writeJson(LS_VERSIONS, all);
}

function localTrashPurge() {
    const trash = readJson(LS_TRASH);
    const cutoff = Date.now() - TRASH_TTL_MS;
    let changed = false;

    Object.keys(trash).forEach((id) => {
        if (trash[id].deleted * 1000 < cutoff) {
            delete trash[id];
            changed = true;
        }
    });

    if (changed) writeJson(LS_TRASH, trash);
}

/** Mirrors the server's snippet format: context either side, one line. */
function localSnippet(content, needle) {
    const at = content.toLowerCase().indexOf(needle.toLowerCase());
    if (at === -1) return null;

    const start = Math.max(0, at - 40);
    const end = Math.min(content.length, at + needle.length + 90);
    const text = content.slice(start, end).replace(/\s+/g, ' ').trim();

    let matches = 0;
    const lower = content.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    for (let i = lower.indexOf(lowerNeedle); i !== -1; i = lower.indexOf(lowerNeedle, i + lowerNeedle.length)) {
        matches++;
    }

    return { snippet: text, matches };
}

/** Shape one localStorage record the way the server reports a file. */
function localMeta(name, record) {
    return {
        name,
        title: record.title || titleDefault(name),
        tags: normalizeTags(record.tags || []),
        size: record.content.length,
        modified: Math.floor(Date.parse(record.timestamp || 0) / 1000) || 0
    };
}

const localStore = {
    async list() {
        const files = readStore();
        return Object.keys(files).map((name) => localMeta(name, files[name]));
    },
    async search(q) {
        const files = readStore();
        const needle = q.toLowerCase();

        return Object.keys(files).map((name) => {
            const record = files[name];
            const meta = localMeta(name, record);
            const hit = localSnippet(record.content, q);

            const inMeta = name.toLowerCase().includes(needle)
                || meta.title.toLowerCase().includes(needle)
                || meta.tags.join(' ').includes(needle);

            if (!hit && !inMeta) return null;

            return Object.assign(meta, {
                snippet: hit ? hit.snippet : '',
                matches: hit ? hit.matches : 0
            });
        }).filter(Boolean).sort((a, b) => {
            if ((a.matches === 0) !== (b.matches === 0)) return a.matches === 0 ? -1 : 1;
            return b.matches - a.matches;
        });
    },
    async read(filename) {
        const files = readStore();
        if (!files[filename]) throw new ApiError('File not found.', 'not_found');

        // Records written before versioning get a token on first read
        if (!files[filename].version) {
            files[filename].version = newStamp();
            writeStore(files);
        }

        const record = files[filename];
        return {
            content: record.content,
            version: record.version,
            title: record.title || titleDefault(filename),
            tags: normalizeTags(record.tags || [])
        };
    },
    async save(title, text, tags = []) {
        const files = readStore();
        const name = slugFromTitle(title, files);
        const version = newStamp();

        files[name] = {
            content: text,
            timestamp: new Date().toISOString(),
            version,
            title: title.trim().slice(0, 120),
            tags: normalizeTags(tags)
        };
        writeStore(files);

        return { filename: name, version, title: files[name].title, tags: files[name].tags };
    },
    async update(filename, text, base = '', meta = {}) {
        const files = readStore();
        const existing = files[filename];
        if (!existing) throw new ApiError('File not found.', 'not_found');

        // Another tab sharing this localStorage may have saved in the meantime
        if (base && existing.version && existing.version !== base) {
            throw new ApiError('This file changed since you opened it.', 'conflict', {
                current: existing.content,
                version: existing.version
            });
        }

        localSnapshot(filename);
        const version = newStamp();

        files[filename] = {
            content: text,
            timestamp: new Date().toISOString(),
            version,
            // Renaming rewrites the title, never the key — versions and trash
            // entries point at the key, so moving it would orphan them
            title: meta.title !== undefined
                ? String(meta.title).trim().slice(0, 120)
                : (existing.title || titleDefault(filename)),
            tags: meta.tags !== undefined
                ? normalizeTags(meta.tags)
                : normalizeTags(existing.tags || [])
        };
        writeStore(files);

        return { filename, version, title: files[filename].title, tags: files[filename].tags };
    },
    async remove(filename) {
        const files = readStore();
        if (!files[filename]) throw new ApiError('File not found.', 'not_found');

        const id = newStamp() + '__' + filename;
        const trash = readJson(LS_TRASH);
        trash[id] = {
            name: filename,
            title: files[filename].title || titleDefault(filename),
            tags: files[filename].tags || [],
            content: files[filename].content,
            deleted: Math.floor(Date.now() / 1000)
        };
        writeJson(LS_TRASH, trash);

        delete files[filename];
        writeStore(files);
        return id;
    },

    async listTrash() {
        localTrashPurge();
        const trash = readJson(LS_TRASH);

        return Object.keys(trash).map((id) => ({
            id,
            name: trash[id].name,
            title: trash[id].title || titleDefault(trash[id].name),
            deleted: trash[id].deleted,
            size: trash[id].content.length
        })).sort((a, b) => b.deleted - a.deleted);
    },
    async restore(id) {
        const trash = readJson(LS_TRASH);
        const entry = trash[id];
        if (!entry) throw new ApiError('That trash entry no longer exists.', 'not_found');

        const files = readStore();
        let target = entry.name;

        // Never overwrite a live file with a restored one
        if (files[target]) {
            const base = target.replace(/\.txt$/, '');
            let n = 2;
            while (files[`${base}-restored-${n}.txt`] && n < 100) n++;
            target = `${base}-restored-${n}.txt`;
        }

        files[target] = {
            content: entry.content,
            timestamp: new Date().toISOString(),
            version: newStamp(),
            title: entry.title || titleDefault(entry.name),
            tags: normalizeTags(entry.tags || [])
        };
        writeStore(files);

        delete trash[id];
        writeJson(LS_TRASH, trash);
        return target;
    },
    async destroyTrash(id) {
        const trash = readJson(LS_TRASH);
        const entry = trash[id];
        if (!entry) throw new ApiError('That trash entry no longer exists.', 'not_found');

        delete trash[id];
        writeJson(LS_TRASH, trash);

        if (!readStore()[entry.name]) localVersionsDestroy(entry.name);
    },

    async listVersions(filename) {
        return (readJson(LS_VERSIONS)[filename] || [])
            .map(({ stamp, saved, content }) => ({ stamp, saved, size: content.length }));
    },
    async readVersion(filename, stamp) {
        const version = (readJson(LS_VERSIONS)[filename] || []).find((v) => v.stamp === stamp);
        if (!version) throw new ApiError('That revision no longer exists.', 'not_found');
        return version.content;
    }
};

const store = () => (state.isServerMode ? serverStore : localStore);
