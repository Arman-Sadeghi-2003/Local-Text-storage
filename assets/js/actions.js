/* ============================================
   actions.js — Per-file actions: download, copy, delete.
   ============================================ */

async function downloadFile(filename) {
    try {
        const { content } = await store().read(filename);
        const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast(`“${displayName(filename)}” downloaded.`);
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
        'Move to trash?',
        `“${displayName(filename)}” goes to the trash, where it stays for 30 days before being purged.`,
        'Move to trash'
    );
    if (!ok) return;

    try {
        const id = await store().remove(filename);

        if (state.selectedFile === filename) clearViewer();
        if (state.editingFile === filename) exitEditMode();

        await loadFiles({ silent: true });

        toast(`“${displayName(filename)}” moved to the trash.`, 'success', {
            label: 'Undo',
            onClick: () => restoreFile(id)
        });
    } catch (error) {
        toast(error.message, 'error');
    }
}
