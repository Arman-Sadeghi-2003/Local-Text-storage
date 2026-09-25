/* ============================================
   transfer.js — Import, export, migration, and bulk selection.
   ============================================ */

const BUNDLE_FORMAT = 'text-file-storage';

function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/** Collects a bundle from whichever store is active. */
async function buildBundle(names = null) {
    if (state.isServerMode) {
        const data = await guarded(apiGet({ action: 'export' }));
        const bundle = data.bundle;

        if (names) {
            bundle.files = bundle.files.filter((f) => names.includes(f.name));
        }
        return bundle;
    }

    const files = readStore();
    const wanted = names || Object.keys(files);

    return {
        format: BUNDLE_FORMAT,
        version: 3,
        exported: Math.floor(Date.now() / 1000),
        files: wanted.filter((name) => files[name]).map((name) => ({
            name,
            title: files[name].title || titleDefault(name),
            tags: normalizeTags(files[name].tags || []),
            modified: Math.floor(Date.parse(files[name].timestamp || 0) / 1000) || 0,
            content: files[name].content
        }))
    };
}

async function exportFiles(names = null) {
    try {
        const bundle = await buildBundle(names);

        if (bundle.files.length === 0) {
            toast('Nothing to export.', 'error');
            return;
        }

        const stamp = new Date().toISOString().slice(0, 10);
        saveBlob(
            new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
            `text-storage-${stamp}.json`
        );

        toast(`Exported ${bundle.files.length} file${bundle.files.length === 1 ? '' : 's'}.`);
    } catch (error) {
        toast(error.message, 'error');
    }
}

el.exportBtn.addEventListener('click', () => exportFiles());

/** Turns dropped or picked files into {title, tags, content} entries. */
async function readImportEntries(fileList) {
    const entries = [];

    for (const file of Array.from(fileList)) {
        let text;
        try {
            text = await file.text();
        } catch (e) {
            toast(`Could not read “${file.name}”.`, 'error');
            continue;
        }

        // A bundle carries many files and their metadata; anything else is one file
        if (/\.json$/i.test(file.name)) {
            let parsed = null;
            try {
                parsed = JSON.parse(text);
            } catch (e) {
                toast(`“${file.name}” is not valid JSON.`, 'error');
                continue;
            }

            if (!parsed || !Array.isArray(parsed.files)) {
                toast(`“${file.name}” is not a Text File Storage bundle.`, 'error');
                continue;
            }

            parsed.files.forEach((entry) => {
                if (typeof entry.content !== 'string') return;
                entries.push({
                    title: entry.title || titleDefault(entry.name || 'untitled'),
                    tags: normalizeTags(entry.tags || []),
                    content: entry.content
                });
            });
            continue;
        }

        entries.push({
            title: file.name.replace(/\.[^.]+$/, ''),
            tags: [],
            content: text
        });
    }

    return entries;
}

async function importFiles(fileList) {
    const entries = await readImportEntries(fileList);
    if (entries.length === 0) return;

    // Titles already in use would otherwise produce indistinguishable twins
    const existing = state.files.map((f) => (f.title || f.name).toLowerCase());
    const clashes = entries.filter((e) => existing.includes(e.title.toLowerCase()));

    let skipClashes = false;
    if (clashes.length > 0) {
        skipClashes = await confirmDialog(
            'Some titles already exist',
            `${clashes.length} of ${entries.length} incoming file${entries.length === 1 ? '' : 's'} share a title with something already here. Skip those, or import them as copies?`,
            'Skip them'
        );
    }

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const entry of entries) {
        if (skipClashes && existing.includes(entry.title.toLowerCase())) {
            skipped++;
            continue;
        }

        try {
            await store().save(entry.title, entry.content, entry.tags);
            imported++;
        } catch (error) {
            failed++;
        }
    }

    await loadFiles({ silent: true });

    const parts = [`Imported ${imported}`];
    if (skipped) parts.push(`skipped ${skipped}`);
    if (failed) parts.push(`${failed} failed`);
    toast(parts.join(', ') + '.', failed ? 'error' : 'success');
}

el.importBtn.addEventListener('click', () => el.fileInput.click());

el.fileInput.addEventListener('change', async () => {
    if (el.fileInput.files.length) await importFiles(el.fileInput.files);
    el.fileInput.value = '';       // let the same file be picked again
});

/* Drag and drop onto the sidebar */
let dragDepth = 0;

el.sidebar.addEventListener('dragenter', (e) => {
    if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    dragDepth++;
    el.sidebar.classList.add('is-dropping');
});

el.sidebar.addEventListener('dragover', (e) => {
    if (Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault();
});

el.sidebar.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) el.sidebar.classList.remove('is-dropping');
});

el.sidebar.addEventListener('drop', async (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();

    dragDepth = 0;
    el.sidebar.classList.remove('is-dropping');

    await importFiles(e.dataTransfer.files);
});

/* ============================================
   Migration: browser storage -> server
   ============================================ */

/** Offers to upload leftover local files once signed in to a server. */
function offerMigration() {
    if (!state.isServerMode) return;

    const local = Object.keys(readStore());
    if (local.length === 0) return;

    toast(
        `${local.length} file${local.length === 1 ? '' : 's'} still stored in this browser.`,
        'success',
        { label: 'Upload to server', onClick: migrateLocalToServer }
    );
}

async function migrateLocalToServer() {
    const files = readStore();
    const names = Object.keys(files);
    if (names.length === 0) return;

    const existing = state.files.map((f) => (f.title || f.name).toLowerCase());

    let uploaded = 0;
    let skipped = 0;
    let failed = 0;

    for (const name of names) {
        const record = files[name];
        const title = record.title || titleDefault(name);

        if (existing.includes(title.toLowerCase())) {
            skipped++;
            continue;
        }

        try {
            await serverStore.save(title, record.content, normalizeTags(record.tags || []));
            uploaded++;
        } catch (error) {
            failed++;
        }
    }

    await loadFiles({ silent: true });

    const parts = [`Uploaded ${uploaded}`];
    if (skipped) parts.push(`skipped ${skipped} already here`);
    if (failed) parts.push(`${failed} failed`);

    toast(parts.join(', ') + '.', failed ? 'error' : 'success', {
        label: 'Clear browser copies',
        onClick: clearLocalAfterMigration
    });
}

async function clearLocalAfterMigration() {
    const ok = await confirmDialog(
        'Clear browser storage?',
        'The files saved in this browser will be removed. Their uploaded copies on the server are unaffected.',
        'Clear them'
    );
    if (!ok) return;

    writeStore({});
    toast('Browser copies cleared.');
}

/* ============================================
   Bulk selection
   ============================================ */

function setSelecting(on) {
    state.selecting = on;
    state.selected = [];

    el.bulkBar.hidden = !on;
    el.sidebarTools.hidden = on;

    updateBulkCount();
    renderList();
}

function updateBulkCount() {
    el.bulkCount.textContent = `${state.selected.length} selected`;
}

function toggleSelected(name) {
    const at = state.selected.indexOf(name);
    if (at === -1) {
        state.selected.push(name);
    } else {
        state.selected.splice(at, 1);
    }
    updateBulkCount();
}

el.selectBtn.addEventListener('click', () => setSelecting(true));
el.bulkCancelBtn.addEventListener('click', () => setSelecting(false));

el.bulkAllBtn.addEventListener('click', () => {
    const all = state.files.map((f) => f.name);
    state.selected = state.selected.length === all.length ? [] : all;
    updateBulkCount();
    renderList();
});

el.bulkExportBtn.addEventListener('click', async () => {
    if (state.selected.length === 0) {
        toast('Nothing selected.', 'error');
        return;
    }
    await exportFiles(state.selected.slice());
});

el.bulkDeleteBtn.addEventListener('click', async () => {
    const names = state.selected.slice();
    if (names.length === 0) {
        toast('Nothing selected.', 'error');
        return;
    }

    const ok = await confirmDialog(
        'Move to trash?',
        `${names.length} file${names.length === 1 ? '' : 's'} will go to the trash, where they stay for 30 days.`,
        'Move to trash'
    );
    if (!ok) return;

    let done = 0;
    let failed = 0;

    for (const name of names) {
        try {
            await store().remove(name);
            if (state.selectedFile === name) clearViewer();
            if (state.editingFile === name) exitEditMode();
            done++;
        } catch (error) {
            failed++;
        }
    }

    setSelecting(false);
    await loadFiles({ silent: true });

    toast(`${done} moved to the trash${failed ? `, ${failed} failed` : ''}.`, failed ? 'error' : 'success');
});
