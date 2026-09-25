/* ============================================
   list.js — Sidebar: file list, trash list, search, tags, sorting.
   ============================================ */

async function loadFiles({ silent = false } = {}) {
    if (!silent) el.refreshBtn.classList.add('is-spinning');
    try {
        const [files, trash] = await Promise.all([store().list(), store().listTrash()]);
        state.files = files;
        state.trash = trash;

        // Keep visible results in step with the files they point at
        if (state.searchResults) {
            state.searchResults = await store().search(state.searchQuery);
        }

        renderList();
    } catch (error) {
        toast(error.message, 'error');
        showEmptyState('Could not load the list.');
    } finally {
        el.refreshBtn.classList.remove('is-spinning');
    }
}

function showEmptyState(message) {
    el.filesList.textContent = '';
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = message;
    el.filesList.appendChild(p);
}

/** Renders whichever view is active. Kept as the single entry point. */
function renderList() {
    el.fileCount.textContent = String(state.files.length);
    el.trashCount.textContent = String(state.trash.length);

    renderTagBar();

    if (state.view === 'trash') {
        renderTrash();
    } else {
        renderFiles();
    }
}

/** Chips for every tag in use, newest counts first. */
function renderTagBar() {
    if (state.view === 'trash' || state.searchResults) {
        el.tagBar.hidden = true;
        return;
    }

    const counts = {};
    state.files.forEach((file) => {
        (file.tags || []).forEach((tag) => { counts[tag] = (counts[tag] || 0) + 1; });
    });

    const tags = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));

    if (tags.length === 0) {
        el.tagBar.hidden = true;
        return;
    }

    el.tagBar.textContent = '';
    tags.forEach((tag) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tag-chip' + (tag === state.tagFilter ? ' is-active' : '');
        chip.textContent = `${tag} ${counts[tag]}`;
        chip.setAttribute('aria-pressed', String(tag === state.tagFilter));

        chip.addEventListener('click', () => {
            state.tagFilter = state.tagFilter === tag ? '' : tag;
            renderList();
        });

        el.tagBar.appendChild(chip);
    });

    el.tagBar.hidden = false;
}

function sortEntries(entries) {
    const sorted = entries.slice();

    if (state.sort === 'name') {
        sorted.sort((a, b) => (a.title || a.name)
            .localeCompare(b.title || b.name, undefined, { numeric: true, sensitivity: 'base' }));
    } else if (state.sort === 'size') {
        sorted.sort((a, b) => b.size - a.size);
    } else {
        sorted.sort((a, b) => b.modified - a.modified);
    }

    return sorted;
}

function renderFiles() {
    el.filesList.textContent = '';

    // Content-search results replace the list until cleared
    if (state.searchResults) {
        el.searchBannerText.textContent = state.searchResults.length === 0
            ? `No files contain “${state.searchQuery}”`
            : `${state.searchResults.length} file${state.searchResults.length === 1 ? '' : 's'} containing “${state.searchQuery}”`;
        el.searchBanner.hidden = false;

        if (state.searchResults.length === 0) {
            showEmptyState('Nothing matched. Try a shorter term.');
            return;
        }

        state.searchResults.forEach((entry) => {
            el.filesList.appendChild(buildFileRow(entry, state.searchQuery));
        });
        return;
    }

    el.searchBanner.hidden = true;

    // "tag:work" in the search box filters by tag instead of by name
    const raw = state.filter;
    const tagQuery = /^tag:\s*(.+)$/i.exec(raw);
    const term = tagQuery ? '' : raw.toLowerCase();
    const tag = tagQuery ? tagQuery[1].trim().toLowerCase() : state.tagFilter;

    let matching = state.files;
    if (tag) {
        matching = matching.filter((f) => (f.tags || []).includes(tag));
    }
    if (term) {
        matching = matching.filter((f) =>
            (f.title || f.name).toLowerCase().includes(term) || f.name.toLowerCase().includes(term));
    }

    const visible = sortEntries(matching);

    if (visible.length === 0) {
        let message;
        if (state.files.length === 0) {
            message = 'No files yet. Create one with the button above.';
        } else if (tag && !term) {
            message = `No files tagged “${tag}”.`;
        } else {
            message = `No titles match “${state.filter}”. Press Enter to search inside files.`;
        }
        showEmptyState(message);
        return;
    }

    visible.forEach((entry) => {
        el.filesList.appendChild(buildFileRow(entry));
    });
}

function renderTrash() {
    const term = state.filter.toLowerCase();
    const visible = term
        ? state.trash.filter((entry) => (entry.title || entry.name).toLowerCase().includes(term))
        : state.trash;

    el.filesList.textContent = '';

    if (visible.length === 0) {
        showEmptyState(state.trash.length === 0
            ? 'The trash is empty. Deleted files stay here for 30 days.'
            : `No deleted files match “${state.filter}”.`);
        return;
    }

    visible.forEach((entry) => {
        el.filesList.appendChild(buildTrashRow(entry));
    });
}

function buildTrashRow(entry) {
    const row = document.createElement('div');
    row.className = 'file-item trash-item';
    row.setAttribute('role', 'listitem');

    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🗑';

    const label = document.createElement('span');
    label.className = 'file-name';

    const shown = entry.title || titleDefault(entry.name);

    const name = document.createElement('span');
    name.textContent = shown;
    name.title = `${shown} — ${entry.name}`;

    const meta = document.createElement('span');
    meta.className = 'trash-meta';
    meta.textContent = 'Deleted ' + relativeTime(entry.deleted);

    label.append(name, meta);

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.append(
        rowButton('↺', 'Restore ' + shown, () => restoreFile(entry.id)),
        rowButton('✕', 'Delete ' + shown + ' permanently', () => destroyTrashEntry(entry), true)
    );

    row.append(icon, label, actions);
    return row;
}

/** "3 minutes ago", "yesterday", "on 14 Aug 2026" */
function relativeTime(unixSeconds) {
    if (!unixSeconds) return 'recently';

    const seconds = Math.floor(Date.now() / 1000) - unixSeconds;
    if (seconds < 60) return 'just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;

    return 'on ' + new Date(unixSeconds * 1000).toLocaleDateString();
}

function setView(view) {
    state.view = view;

    const trash = view === 'trash';
    el.segFiles.classList.toggle('is-active', !trash);
    el.segTrash.classList.toggle('is-active', trash);
    el.segFiles.setAttribute('aria-selected', String(!trash));
    el.segTrash.setAttribute('aria-selected', String(trash));

    el.newFileBtn.hidden = trash;
    el.listControls.hidden = trash;
    el.sidebarTools.hidden = trash || state.selecting;

    // Selection belongs to the files view
    if (trash && state.selecting) setSelecting(false);
    el.searchInput.placeholder = trash
        ? 'Search deleted files…'
        : 'Search names, Enter for contents';

    // Results belong to the files view only
    if (trash && state.searchResults) clearContentSearch({ keepInput: true });

    renderList();
}

el.segFiles.addEventListener('click', () => setView('files'));
el.segTrash.addEventListener('click', () => setView('trash'));

/* ============================================
   Trash actions
   ============================================ */

async function restoreFile(id) {
    // Captured before the refresh, which drops the entry from state.trash
    const entry = state.trash.find((t) => t.id === id);

    try {
        const filename = await store().restore(id);
        await loadFiles({ silent: true });

        const renamed = entry && entry.name !== filename;
        toast(renamed
            ? `Restored as “${filename}” — the original name was taken.`
            : `“${filename}” restored.`);

        await viewFile(filename);
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function destroyTrashEntry(entry) {
    const confirmed = await confirmDialog(
        'Delete permanently?',
        `“${entry.title || titleDefault(entry.name)}” and its revision history will be erased. This cannot be undone.`,
        'Delete forever'
    );
    if (!confirmed) return;

    try {
        await store().destroyTrash(entry.id);
        toast(`“${entry.title || titleDefault(entry.name)}” deleted permanently.`);
        await loadFiles({ silent: true });
    } catch (error) {
        toast(error.message, 'error');
    }
}

/**
 * @param entry {name, size, modified, snippet?, matches?}
 * @param term  when set, the row shows its snippet with the term highlighted
 */
function buildFileRow(entry, term = '') {
    const filename = entry.name;

    const checked = state.selected.includes(filename);

    const row = document.createElement('div');
    row.className = 'file-item'
        + (!state.selecting && filename === state.selectedFile ? ' is-selected' : '')
        + (state.selecting && checked ? ' is-checked' : '')
        + (term ? ' result-item' : '');
    row.setAttribute('role', 'listitem');
    row.tabIndex = 0;

    // While selecting, a row toggles its tick instead of opening the file
    const activate = () => {
        if (state.selecting) {
            toggleSelected(filename);
            renderList();
        } else {
            viewFile(filename);
        }
    };

    row.addEventListener('click', activate);
    row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activate();
        }
    });

    let icon;
    if (state.selecting) {
        icon = document.createElement('input');
        icon.type = 'checkbox';
        icon.className = 'row-check';
        icon.checked = checked;
        icon.tabIndex = -1;                     // the row itself is the control
        icon.setAttribute('aria-label', 'Select ' + (entry.title || filename));
        icon.addEventListener('click', (e) => e.stopPropagation());
        icon.addEventListener('change', () => {
            toggleSelected(filename);
            renderList();
        });
    } else {
        icon = document.createElement('span');
        icon.className = 'file-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '📄';
    }

    const label = document.createElement('span');
    label.className = 'file-name';

    // textContent, not innerHTML — titles are never treated as markup
    const name = document.createElement('span');
    name.textContent = entry.title || titleDefault(filename);
    name.title = `${entry.title || titleDefault(filename)} — ${filename}`;
    label.appendChild(name);

    if (term && entry.snippet) {
        const snippet = document.createElement('span');
        snippet.className = 'snippet';
        highlightInto(snippet, entry.snippet, term);
        label.appendChild(snippet);
    } else if (term) {
        const meta = document.createElement('span');
        meta.className = 'file-meta';
        meta.textContent = 'Matched the filename';
        label.appendChild(meta);
    } else {
        const meta = document.createElement('span');
        meta.className = 'file-meta';
        meta.textContent = `${formatBytes(entry.size)} · ${relativeTime(entry.modified)}`;
        label.appendChild(meta);
    }

    if (entry.tags && entry.tags.length) {
        const tags = document.createElement('span');
        tags.className = 'row-tags';

        entry.tags.forEach((tag) => {
            const pill = document.createElement('span');
            pill.className = 'row-tag';
            pill.textContent = tag;
            tags.appendChild(pill);
        });

        label.appendChild(tags);
    }

    row.append(icon, label);

    if (!state.selecting) {
        const actions = document.createElement('div');
        actions.className = 'row-actions';
        actions.append(
            rowButton('✎', 'Edit ' + filename, () => editFile(filename)),
            rowButton('⭳', 'Download ' + filename, () => downloadFile(filename)),
            rowButton('🗑', 'Delete ' + filename, () => deleteFile(filename), true)
        );
        row.appendChild(actions);
    }

    return row;
}

/**
 * Wraps occurrences of `term` in <mark>, building nodes rather than HTML
 * so search text and file content can never be interpreted as markup.
 */
function highlightInto(target, text, term) {
    const lower = text.toLowerCase();
    const needle = term.toLowerCase();
    let at = 0;

    for (let found = lower.indexOf(needle); found !== -1; found = lower.indexOf(needle, at)) {
        target.append(text.slice(at, found));

        const mark = document.createElement('mark');
        mark.textContent = text.slice(found, found + needle.length);
        target.appendChild(mark);

        at = found + needle.length;
    }

    target.append(text.slice(at));
}

function rowButton(glyph, label, onClick, danger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'row-btn' + (danger ? ' danger' : '');
    button.title = label;
    button.setAttribute('aria-label', label);
    button.textContent = glyph;
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });
    return button;
}

/* Typing filters names instantly; Enter searches inside the files. */
el.searchInput.addEventListener('input', () => {
    state.filter = el.searchInput.value.trim();

    if (state.searchResults) clearContentSearch({ keepInput: true });
    renderList();
});

el.searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    runContentSearch();
});

el.searchClearBtn.addEventListener('click', () => {
    clearContentSearch();
    el.searchInput.focus();
});

async function runContentSearch() {
    const query = el.searchInput.value.trim();

    if (!query) {
        clearContentSearch();
        return;
    }
    if (state.view === 'trash') {
        toast('Content search covers live files only.', 'error');
        return;
    }

    el.refreshBtn.classList.add('is-spinning');
    try {
        state.searchResults = await store().search(query);
        state.searchQuery = query;
        renderList();
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        el.refreshBtn.classList.remove('is-spinning');
    }
}

function clearContentSearch({ keepInput = false } = {}) {
    state.searchResults = null;
    state.searchQuery = '';
    el.searchBanner.hidden = true;

    if (!keepInput) {
        el.searchInput.value = '';
        state.filter = '';
        renderList();
    }
}

el.sortSelect.addEventListener('change', () => {
    state.sort = el.sortSelect.value;
    renderList();
});

el.refreshBtn.addEventListener('click', () => loadFiles());
