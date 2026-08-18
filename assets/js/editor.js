/* ============================================
   editor.js — The Edit tab, saving, and conflict resolution.
   ============================================ */

function enterEditMode(filename, content, meta = {}) {
    state.editingFile = filename;
    state.editingTitle = meta.title || titleDefault(filename);
    state.editingTags = normalizeTags(meta.tags || []);

    // The title stays editable — renaming is just changing it
    el.filenameInput.value = state.editingTitle;
    el.filenameInput.disabled = false;
    el.tagsInput.value = state.editingTags.join(', ');
    el.textContent.value = content;

    el.submitBtn.textContent = 'Update file';
    el.cancelEditBtn.hidden = false;

    el.filenameHint.textContent = '';
    el.filenameHint.append('Editing ');
    const code = document.createElement('code');
    code.textContent = filename;
    el.filenameHint.appendChild(code);
    el.filenameHint.classList.remove('warn');

    updateCounter();
    showTab('edit');
    el.textContent.focus();
}

function exitEditMode({ keepText = false } = {}) {
    state.editingFile = '';
    state.editingTitle = '';
    state.editingTags = [];

    el.filenameInput.disabled = false;
    el.submitBtn.textContent = 'Save file';
    el.cancelEditBtn.hidden = true;

    if (!keepText) {
        el.filenameInput.value = '';
        el.tagsInput.value = '';
        el.textContent.value = '';
    }

    updateFilenameHint();
    updateCounter();
}

async function editFile(filename) {
    try {
        const { content, version, title, tags } = await store().read(filename);
        state.editBaseVersion = version;                  // what this edit started from
        enterEditMode(filename, await offerDraft(filename, content), { title, tags });
    } catch (error) {
        toast(error.message, 'error');
    }
}

el.cancelEditBtn.addEventListener('click', () => {
    clearDraft();               // cancelling means discarding
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
    const title = el.filenameInput.value.trim();
    const tags = normalizeTags(el.tagsInput.value);

    // api.php rejects empty content, so both modes require it for consistency
    if (!text.trim()) {
        toast('Content cannot be empty.', 'error');
        el.textContent.focus();
        return;
    }

    if (!title) {
        toast('Please enter a title.', 'error');
        el.filenameInput.focus();
        return;
    }

    /*
     * A new file whose title matches an existing one would leave two entries
     * the user cannot tell apart. Offer to update that file instead — and if
     * they decline, let them pick a different title rather than saving a twin.
     */
    let overwriteTarget = '';
    if (!state.editingFile) {
        const clash = state.files.find(
            (f) => (f.title || f.name).toLowerCase() === title.toLowerCase());

        if (clash) {
            const ok = await confirmDialog(
                'A file with this title exists',
                `“${clash.title || clash.name}” is already saved. Replace its content?`,
                'Replace it'
            );
            if (!ok) {
                el.filenameInput.select();
                return;
            }
            overwriteTarget = clash.name;
        }
    }

    el.submitBtn.disabled = true;
    try {
        const editing = state.editingFile || overwriteTarget;

        // An explicit overwrite has no base version to check against
        const result = editing
            ? await store().update(
                editing,
                text,
                overwriteTarget ? '' : state.editBaseVersion,
                { title, tags })
            : await store().save(title, text, tags);

        await afterWrite(result, editing ? 'updated' : 'saved');
    } catch (error) {
        if (error.code === 'conflict') {
            await resolveConflict(state.editingFile, text, error.data);
        } else {
            toast(error.message, 'error');
        }
    } finally {
        el.submitBtn.disabled = false;
    }
});

/** Shared tail of every successful write. */
async function afterWrite(result, verb) {
    state.editBaseVersion = result.version || '';
    toast(`“${result.title || result.filename}” ${verb}.`);

    clearDraft();                   // committed — the draft is redundant now
    exitEditMode();
    await loadFiles({ silent: true });
    await viewFile(result.filename);
}

/* ============================================
   Conflict resolution
   Reached when the stored file moved on between opening it and saving —
   a second tab, another device, or an edit made in the meantime.
   ============================================ */

let conflictResolve = null;

function conflictDialog(filename) {
    el.conflictBody.textContent =
        `“${displayName(filename)}” was saved somewhere else while you were editing. ` +
        'Choose which version to keep — nothing is discarded until you pick.';
    el.conflictBackdrop.hidden = false;
    el.conflictMine.focus();

    return new Promise((resolve) => { conflictResolve = resolve; });
}

function closeConflict(choice) {
    if (!conflictResolve) return;
    el.conflictBackdrop.hidden = true;
    conflictResolve(choice);
    conflictResolve = null;
}

el.conflictMine.addEventListener('click', () => closeConflict('mine'));
el.conflictTheirs.addEventListener('click', () => closeConflict('theirs'));
el.conflictBoth.addEventListener('click', () => closeConflict('both'));
el.conflictCancel.addEventListener('click', () => closeConflict('cancel'));
el.conflictBackdrop.addEventListener('click', (e) => {
    if (e.target === el.conflictBackdrop) closeConflict('cancel');
});

/**
 * @param myText   what the user has in the editor
 * @param theirs   {current, version} as returned by the rejected write
 */
async function resolveConflict(filename, myText, theirs) {
    const live = (theirs && theirs.current) || '';
    const liveVersion = (theirs && theirs.version) || '';

    const choice = await conflictDialog(filename);

    if (choice === 'cancel') {
        toast('Save cancelled — your text is still in the editor.', 'error');
        return;
    }

    if (choice === 'mine') {
        // Retry against the version we were just shown. The other copy is not
        // lost: the overwrite snapshots it into the revision history first.
        try {
            const result = await store().update(filename, myText, liveVersion);
            await afterWrite(result, 'saved over the other version');
            toast('The replaced version is in History if you need it.');
        } catch (error) {
            toast(error.message, 'error');
        }
        return;
    }

    if (choice === 'theirs') {
        state.editBaseVersion = liveVersion;
        clearDraft(filename);
        enterEditMode(filename, live);
        toast('Loaded the saved version. Your text was discarded.');
        return;
    }

    // 'both' — their copy in the viewer, mine still in the editor.
    // The editor's base advances too: the user has now seen the live content,
    // so a later save is a deliberate overwrite rather than a blind one.
    state.editBaseVersion = liveVersion;
    state.viewVersion = liveVersion;
    state.selectedFile = filename;
    state.viewedContent = live;

    el.viewerTitle.textContent = displayName(filename);
    renderViewerContent();
    el.copyBtn.hidden = false;
    el.viewEditBtn.hidden = false;
    el.viewDownloadBtn.hidden = false;
    el.historyBtn.hidden = false;

    showTab('view');
    toast('Saved version shown here; yours is still in the Edit tab.');
}

/* Filename preview + character counter */

function updateFilenameHint() {
    if (state.editingFile) return;      // shows the slug being edited instead

    const raw = el.filenameInput.value.trim();
    if (!raw) {
        el.filenameHint.textContent = 'Any characters — spaces and punctuation are fine';
        el.filenameHint.classList.remove('warn');
        return;
    }

    el.filenameHint.textContent = '';
    el.filenameHint.append('Stored as ');

    const code = document.createElement('code');
    code.textContent = sanitizeName(raw);
    el.filenameHint.appendChild(code);

    // The title is kept verbatim now, so a mangled slug is no longer a warning
    el.filenameHint.classList.remove('warn');
}

function updateCounter() {
    const value = el.textContent.value;
    const chars = value.length;
    const lines = value === '' ? 0 : value.split('\n').length;
    const words = (value.match(/\S+/g) || []).length;

    const parts = [
        `${words.toLocaleString()} word${words === 1 ? '' : 's'}`,
        `${chars.toLocaleString()} char${chars === 1 ? '' : 's'}`,
        `${lines} line${lines === 1 ? '' : 's'}`
    ];

    // ~200 wpm; only worth showing once there is something to read
    if (words >= 200) {
        parts.push(`~${Math.max(1, Math.round(words / 200))} min read`);
    }

    el.counter.textContent = parts.join(' · ');
}

el.filenameInput.addEventListener('input', () => {
    updateFilenameHint();
    scheduleDraftSave();
});

el.tagsInput.addEventListener('input', scheduleDraftSave);

el.textContent.addEventListener('input', () => {
    updateCounter();
    scheduleDraftSave();
});
