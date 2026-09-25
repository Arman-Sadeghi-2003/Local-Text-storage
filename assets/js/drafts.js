/* ============================================
   drafts.js — Editor autosave to localStorage.
   ============================================ */

const DRAFT_PREFIX = 'draft:';
let draftTimer = null;
let draftStatusTimer = null;

function draftKey(filename) {
    const target = filename !== undefined ? filename : state.editingFile;
    return DRAFT_PREFIX + (state.isServerMode ? 'server:' : 'local:') + (target || '__new__');
}

function readDraft(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? null : JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function scheduleDraftSave() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(writeDraft, 600);
}

function writeDraft() {
    const text = el.textContent.value;
    const name = el.filenameInput.value;
    const tags = el.tagsInput.value;

    // Nothing worth keeping
    if (!text.trim() && !name.trim()) {
        clearDraft();
        return;
    }

    try {
        localStorage.setItem(draftKey(), JSON.stringify({
            text,
            name,
            tags,
            saved: Math.floor(Date.now() / 1000)
        }));
        flashDraftSaved();
    } catch (e) {
        /* quota exceeded — the save button still works */
    }
}

function clearDraft(filename) {
    clearTimeout(draftTimer);
    try {
        localStorage.removeItem(draftKey(filename));
    } catch (e) { /* ignore */ }
    el.draftStatus.hidden = true;
}

function flashDraftSaved() {
    el.draftStatus.hidden = false;
    clearTimeout(draftStatusTimer);
    draftStatusTimer = setTimeout(() => { el.draftStatus.hidden = true; }, 1600);
}

/** Offers back a draft for a file whose saved content has since diverged. */
async function offerDraft(filename, savedContent) {
    const draft = readDraft(draftKey(filename));
    if (!draft || draft.text === savedContent) {
        return savedContent;
    }

    const restore = await confirmDialog(
        'Unsaved draft found',
        `You have unsaved changes to “${displayName(filename)}” from ${relativeTime(draft.saved)}. Restore them?`,
        'Restore draft'
    );

    if (restore) {
        toast('Draft restored — save to keep it.');
        return draft.text;
    }

    clearDraft(filename);
    return savedContent;
}

/** Restores an in-progress new file left over from a previous session. */
function restoreNewFileDraft() {
    const draft = readDraft(draftKey(''));
    if (!draft || (!draft.text.trim() && !draft.name.trim())) return;

    el.filenameInput.value = draft.name;
    el.tagsInput.value = draft.tags || '';
    el.textContent.value = draft.text;
    updateFilenameHint();
    updateCounter();

    toast(`Unsaved draft from ${relativeTime(draft.saved)} restored.`);
}

/* Tab key inserts a tab character instead of leaving the textarea */
el.textContent.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    const { selectionStart: start, selectionEnd: end, value } = el.textContent;
    el.textContent.value = value.slice(0, start) + '\t' + value.slice(end);
    el.textContent.selectionStart = el.textContent.selectionEnd = start + 1;
    updateCounter();
});
