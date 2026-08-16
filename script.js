/* ============================================
   Text File Storage — front-end
   Works in two modes:
     server mode -> api.php  (files on disk)
     local mode  -> localStorage key "textFiles"
   ============================================ */

const $ = (id) => document.getElementById(id);

const el = {
    modeIndicator: $('modeIndicator'),
    modeText: $('modeText'),
    themeToggle: $('themeToggle'),
    themeIcon: $('themeIcon'),
    searchInput: $('searchInput'),
    refreshBtn: $('refreshBtn'),
    newFileBtn: $('newFileBtn'),
    filesList: $('filesList'),
    fileCount: $('fileCount'),
    tabEdit: $('tabEdit'),
    tabView: $('tabView'),
    paneEdit: $('paneEdit'),
    paneView: $('paneView'),
    saveForm: $('saveForm'),
    filenameInput: $('filename'),
    filenameHint: $('filenameHint'),
    textContent: $('textContent'),
    counter: $('counter'),
    submitBtn: $('submitBtn'),
    cancelEditBtn: $('cancelEditBtn'),
    viewerTitle: $('viewerTitle'),
    fileViewer: $('fileViewer'),
    copyBtn: $('copyBtn'),
    viewEditBtn: $('viewEditBtn'),
    viewDownloadBtn: $('viewDownloadBtn'),
    toasts: $('toasts'),
    confirmBackdrop: $('confirmBackdrop'),
    confirmTitle: $('confirmTitle'),
    confirmBody: $('confirmBody'),
    confirmOk: $('confirmOk'),
    confirmCancel: $('confirmCancel')
};

const state = {
    isServerMode: false,
    files: [],
    filter: '',
    selectedFile: '',
    viewedContent: '',
    editingFile: ''      // '' when creating a new file
};

/* ============================================
   Storage adapters — same interface, two backends
   ============================================ */

const LS_KEY = 'textFiles';

function readStore() {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    } catch (e) {
        return {};
    }
}

function writeStore(files) {
    localStorage.setItem(LS_KEY, JSON.stringify(files));
}

function sanitizeName(name) {
    return name.replace(/[^a-z0-9_-]/gi, '_') + '.txt';
}

async function postAction(action, fields) {
    const body = new FormData();
    body.append('action', action);
    Object.entries(fields).forEach(([k, v]) => body.append(k, v));
    const response = await fetch('api.php', { method: 'POST', body });
    return response.json();
}

function unwrap(data) {
    if (!data || !data.success) {
        throw new Error((data && data.error) || 'Request failed');
    }
    return data;
}

const serverStore = {
    async list() {
        const response = await fetch('api.php?action=list');
        return unwrap(await response.json()).files;
    },
    async read(filename) {
        const response = await fetch(`api.php?action=read&filename=${encodeURIComponent(filename)}`);
        return unwrap(await response.json()).content;
    },
    async save(filename, text) {
        return unwrap(await postAction('save', { filename, text })).filename;
    },
    async update(filename, text) {
        unwrap(await postAction('update', { filename, text }));
        return filename;
    },
    async remove(filename) {
        unwrap(await postAction('delete', { filename }));
    }
};

const localStore = {
    async list() {
        return Object.keys(readStore()).sort((a, b) => a.localeCompare(b));
    },
    async read(filename) {
        const files = readStore();
        if (!files[filename]) throw new Error('File not found');
        return files[filename].content;
    },
    async save(filename, text) {
        const name = sanitizeName(filename);
        const files = readStore();
        files[name] = { content: text, timestamp: new Date().toISOString() };
        writeStore(files);
        return name;
    },
    async update(filename, text) {
        const files = readStore();
        if (!files[filename]) throw new Error('File not found');
        files[filename] = { content: text, timestamp: new Date().toISOString() };
        writeStore(files);
        return filename;
    },
    async remove(filename) {
        const files = readStore();
        delete files[filename];
        writeStore(files);
    }
};

const store = () => (state.isServerMode ? serverStore : localStore);

/* ============================================
   Mode detection
   ============================================ */

async function detectMode() {
    try {
        const response = await fetch('api.php?action=ping');
        const data = await response.json();
        if (response.ok && data && data.success) {
            setMode(true);
            return;
        }
    } catch (e) {
        /* fall through to local mode */
    }
    setMode(false);
}

function setMode(isServer) {
    state.isServerMode = isServer;
    el.modeIndicator.className = 'mode-pill ' + (isServer ? 'server-mode' : 'local-mode');
    el.modeText.textContent = isServer ? 'Server storage' : 'Browser storage';
    el.modeIndicator.title = isServer
        ? 'Server mode — files are saved on the server in datasets/'
        : 'Local mode — files are saved in this browser only (localStorage)';
}

/* ============================================
   Toasts
   ============================================ */

function toast(message, type = 'success') {
    const node = document.createElement('div');
    node.className = `toast ${type}`;

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = type === 'error' ? '⚠️' : '✅';

    const text = document.createElement('span');
    text.textContent = message;

    node.append(icon, text);
    el.toasts.appendChild(node);

    setTimeout(() => {
        node.classList.add('is-leaving');
        node.addEventListener('animationend', () => node.remove(), { once: true });
    }, type === 'error' ? 5000 : 3000);
}

/* ============================================
   Confirm dialog
   ============================================ */

let confirmResolve = null;

function confirmDialog(title, body, okLabel = 'Delete') {
    el.confirmTitle.textContent = title;
    el.confirmBody.textContent = body;
    el.confirmOk.textContent = okLabel;
    el.confirmBackdrop.hidden = false;
    el.confirmOk.focus();

    return new Promise((resolve) => { confirmResolve = resolve; });
}

function closeConfirm(result) {
    if (!confirmResolve) return;
    el.confirmBackdrop.hidden = true;
    confirmResolve(result);
    confirmResolve = null;
}

el.confirmOk.addEventListener('click', () => closeConfirm(true));
el.confirmCancel.addEventListener('click', () => closeConfirm(false));
el.confirmBackdrop.addEventListener('click', (e) => {
    if (e.target === el.confirmBackdrop) closeConfirm(false);
});

/* ============================================
   Tabs
   ============================================ */

function showTab(name) {
    const editing = name === 'edit';

    el.tabEdit.classList.toggle('is-active', editing);
    el.tabView.classList.toggle('is-active', !editing);
    el.tabEdit.setAttribute('aria-selected', String(editing));
    el.tabView.setAttribute('aria-selected', String(!editing));

    el.paneEdit.classList.toggle('is-active', editing);
    el.paneView.classList.toggle('is-active', !editing);
    el.paneEdit.hidden = !editing;
    el.paneView.hidden = editing;
}

el.tabEdit.addEventListener('click', () => showTab('edit'));
el.tabView.addEventListener('click', () => showTab('view'));

/* ============================================
   File list
   ============================================ */

async function loadFiles({ silent = false } = {}) {
    if (!silent) el.refreshBtn.classList.add('is-spinning');
    try {
        state.files = await store().list();
        renderFiles();
    } catch (error) {
        toast(error.message, 'error');
        el.filesList.textContent = '';
        const p = document.createElement('p');
        p.className = 'empty-state';
        p.textContent = 'Could not load the file list.';
        el.filesList.appendChild(p);
    } finally {
        el.refreshBtn.classList.remove('is-spinning');
    }
}

function renderFiles() {
    const term = state.filter.toLowerCase();
    const visible = term
        ? state.files.filter((f) => f.toLowerCase().includes(term))
        : state.files;

    el.fileCount.textContent = String(state.files.length);
    el.filesList.textContent = '';

    if (visible.length === 0) {
        const p = document.createElement('p');
        p.className = 'empty-state';
        p.textContent = state.files.length === 0
            ? 'No files yet. Create one with the button above.'
            : `No files match “${state.filter}”.`;
        el.filesList.appendChild(p);
        return;
    }

    visible.forEach((filename) => {
        el.filesList.appendChild(buildFileRow(filename));
    });
}

function buildFileRow(filename) {
    const row = document.createElement('div');
    row.className = 'file-item' + (filename === state.selectedFile ? ' is-selected' : '');
    row.setAttribute('role', 'listitem');
    row.tabIndex = 0;
    row.addEventListener('click', () => viewFile(filename));
    row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            viewFile(filename);
        }
    });

    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '📄';

    // textContent, not innerHTML — filenames are never treated as markup
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = filename;
    name.title = filename;

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.append(
        rowButton('✎', 'Edit ' + filename, () => editFile(filename)),
        rowButton('⭳', 'Download ' + filename, () => downloadFile(filename)),
        rowButton('🗑', 'Delete ' + filename, () => deleteFile(filename), true)
    );

    row.append(icon, name, actions);
    return row;
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

el.searchInput.addEventListener('input', () => {
    state.filter = el.searchInput.value.trim();
    renderFiles();
});

el.refreshBtn.addEventListener('click', () => loadFiles());

/* ============================================
   Viewing
   ============================================ */

async function viewFile(filename) {
    try {
        const content = await store().read(filename);

        state.selectedFile = filename;
        state.viewedContent = content;

        el.viewerTitle.textContent = filename;
        el.viewerTitle.title = filename;
        // textContent keeps stored text as text, never as HTML
        el.fileViewer.textContent = content;
        el.fileViewer.classList.toggle('is-empty', content.length === 0);
        if (content.length === 0) el.fileViewer.textContent = '(empty file)';

        el.copyBtn.hidden = false;
        el.viewEditBtn.hidden = false;
        el.viewDownloadBtn.hidden = false;

        renderFiles();
        showTab('view');
    } catch (error) {
        toast(error.message, 'error');
    }
}

function clearViewer() {
    state.selectedFile = '';
    state.viewedContent = '';
    el.viewerTitle.textContent = 'No file selected';
    el.viewerTitle.removeAttribute('title');
    el.fileViewer.textContent = 'Select a file from the list to view its content.';
    el.fileViewer.classList.add('is-empty');
    el.copyBtn.hidden = true;
    el.viewEditBtn.hidden = true;
    el.viewDownloadBtn.hidden = true;
}

el.viewEditBtn.addEventListener('click', () => {
    if (state.selectedFile) editFile(state.selectedFile);
});

el.viewDownloadBtn.addEventListener('click', () => {
    if (state.selectedFile) downloadFile(state.selectedFile);
});

/* ============================================
   Editing / saving
   ============================================ */

function enterEditMode(filename, content) {
    state.editingFile = filename;

    el.filenameInput.value = filename.replace(/\.txt$/, '');
    el.filenameInput.disabled = true;
    el.textContent.value = content;
    el.submitBtn.textContent = 'Update file';
    el.cancelEditBtn.hidden = false;
    el.filenameHint.textContent = 'Updating ' + filename;
    el.filenameHint.classList.remove('warn');

    updateCounter();
    showTab('edit');
    el.textContent.focus();
}

function exitEditMode({ keepText = false } = {}) {
    state.editingFile = '';

    el.filenameInput.disabled = false;
    el.submitBtn.textContent = 'Save file';
    el.cancelEditBtn.hidden = true;

    if (!keepText) {
        el.filenameInput.value = '';
        el.textContent.value = '';
    }

    updateFilenameHint();
    updateCounter();
}

async function editFile(filename) {
    try {
        const content = await store().read(filename);
        enterEditMode(filename, content);
    } catch (error) {
        toast(error.message, 'error');
    }
}

el.cancelEditBtn.addEventListener('click', () => {
    exitEditMode();
    el.filenameInput.focus();
});

el.newFileBtn.addEventListener('click', () => {
    exitEditMode();
    showTab('edit');
    el.filenameInput.focus();
});

el.saveForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const text = el.textContent.value;
    const rawName = el.filenameInput.value.trim();

    // api.php rejects empty content, so both modes require it for consistency
    if (!text.trim()) {
        toast('Content cannot be empty.', 'error');
        el.textContent.focus();
        return;
    }

    if (!state.editingFile && !rawName) {
        toast('Please enter a filename.', 'error');
        el.filenameInput.focus();
        return;
    }

    if (!state.editingFile && state.files.includes(sanitizeName(rawName))) {
        const ok = await confirmDialog(
            'Overwrite file?',
            `“${sanitizeName(rawName)}” already exists. Saving will replace its content.`,
            'Overwrite'
        );
        if (!ok) return;
    }

    el.submitBtn.disabled = true;
    try {
        const saved = state.editingFile
            ? await store().update(state.editingFile, text)
            : await store().save(rawName, text);

        toast(state.editingFile ? `“${saved}” updated.` : `“${saved}” saved.`);
        exitEditMode();
        await loadFiles({ silent: true });
        await viewFile(saved);
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        el.submitBtn.disabled = false;
    }
});

/* Filename preview + character counter */

function updateFilenameHint() {
    if (state.editingFile) return;

    const raw = el.filenameInput.value.trim();
    if (!raw) {
        el.filenameHint.textContent = 'Saved as a .txt file';
        el.filenameHint.classList.remove('warn');
        return;
    }

    const final = sanitizeName(raw);
    el.filenameHint.textContent = '';
    el.filenameHint.append('Saved as ');

    const code = document.createElement('code');
    code.textContent = final;
    el.filenameHint.appendChild(code);

    // Warn when sanitizing actually changed the name
    el.filenameHint.classList.toggle('warn', final !== raw + '.txt');
}

function updateCounter() {
    const value = el.textContent.value;
    const chars = value.length;
    const lines = value === '' ? 0 : value.split('\n').length;
    el.counter.textContent = `${chars.toLocaleString()} character${chars === 1 ? '' : 's'} · ${lines} line${lines === 1 ? '' : 's'}`;
}

el.filenameInput.addEventListener('input', updateFilenameHint);
el.textContent.addEventListener('input', updateCounter);

/* Tab key inserts a tab character instead of leaving the textarea */
el.textContent.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    const { selectionStart: start, selectionEnd: end, value } = el.textContent;
    el.textContent.value = value.slice(0, start) + '\t' + value.slice(end);
    el.textContent.selectionStart = el.textContent.selectionEnd = start + 1;
    updateCounter();
});

/* ============================================
   Download / copy / delete
   ============================================ */

async function downloadFile(filename) {
    try {
        const content = await store().read(filename);
        const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast(`“${filename}” downloaded.`);
    } catch (error) {
        toast(error.message, 'error');
    }
}

el.copyBtn.addEventListener('click', async () => {
    if (!state.viewedContent) {
        toast('Nothing to copy.', 'error');
        return;
    }

    try {
        await navigator.clipboard.writeText(state.viewedContent);
        flashCopied();
    } catch (error) {
        if (fallbackCopy(state.viewedContent)) {
            flashCopied();
        } else {
            toast('Could not copy to the clipboard.', 'error');
        }
    }
});

function flashCopied() {
    const original = el.copyBtn.textContent;
    el.copyBtn.textContent = '✓ Copied';
    setTimeout(() => { el.copyBtn.textContent = original; }, 1800);
    toast('Content copied to the clipboard.');
}

function fallbackCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();

    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (error) {
        ok = false;
    }
    document.body.removeChild(area);
    return ok;
}

async function deleteFile(filename) {
    const ok = await confirmDialog(
        'Delete file?',
        `“${filename}” will be removed permanently. This cannot be undone.`
    );
    if (!ok) return;

    try {
        await store().remove(filename);
        toast(`“${filename}” deleted.`);

        if (state.selectedFile === filename) clearViewer();
        if (state.editingFile === filename) exitEditMode();

        await loadFiles({ silent: true });
    } catch (error) {
        toast(error.message, 'error');
    }
}

/* ============================================
   Theme
   ============================================ */

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    el.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    el.themeToggle.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    try {
        localStorage.setItem('theme', theme);
    } catch (e) { /* storage may be unavailable */ }
}

function initTheme() {
    let saved = null;
    try {
        saved = localStorage.getItem('theme');
    } catch (e) { /* ignore */ }

    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}

el.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
});

/* ============================================
   Keyboard shortcuts
   ============================================ */

document.addEventListener('keydown', (e) => {
    // Escape closes the dialog
    if (e.key === 'Escape' && !el.confirmBackdrop.hidden) {
        e.preventDefault();
        closeConfirm(false);
        return;
    }

    // Ctrl/Cmd+S saves
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        showTab('edit');
        el.saveForm.requestSubmit();
        return;
    }

    // Ctrl/Cmd+K focuses search
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        el.searchInput.focus();
        el.searchInput.select();
    }
});

/* Warn before leaving with unsaved text */
window.addEventListener('beforeunload', (e) => {
    if (el.textContent.value.trim()) {
        e.preventDefault();
        e.returnValue = '';
    }
});

/* ============================================
   Start
   ============================================ */

initTheme();
clearViewer();
updateFilenameHint();
updateCounter();
detectMode().then(() => loadFiles());
