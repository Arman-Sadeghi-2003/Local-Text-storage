/* ============================================
   viewer.js — The View tab and version history.
   ============================================ */

async function viewFile(filename) {
    try {
        const { content, version } = await store().read(filename);

        state.selectedFile = filename;
        state.viewedContent = content;
        state.viewVersion = version;

        el.viewerTitle.textContent = '';
        el.viewerTitle.append(document.createTextNode(displayName(filename)));

        const slug = document.createElement('span');
        slug.className = 'slug-hint';
        slug.textContent = '  ' + filename;
        el.viewerTitle.appendChild(slug);
        el.viewerTitle.title = filename;

        // Nodes, never HTML strings — stored text is never markup
        renderViewerContent();

        el.copyBtn.hidden = false;
        el.viewEditBtn.hidden = false;
        el.viewDownloadBtn.hidden = false;
        el.historyBtn.hidden = false;
        el.markdownBtn.hidden = false;
        closeHistory();

        renderList();
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
    el.fileViewer.hidden = false;
    el.markdownView.hidden = true;

    el.copyBtn.hidden = true;
    el.viewEditBtn.hidden = true;
    el.viewDownloadBtn.hidden = true;
    el.historyBtn.hidden = true;
    el.markdownBtn.hidden = true;
    closeHistory();
}

/* ============================================
   Version history
   ============================================ */

function closeHistory() {
    state.versions = [];
    state.viewingVersion = '';
    el.versionPanel.hidden = true;
    el.versionBanner.hidden = true;
    el.historyBtn.setAttribute('aria-expanded', 'false');
}

el.historyBtn.addEventListener('click', async () => {
    if (!el.versionPanel.hidden) {
        el.versionPanel.hidden = true;
        el.historyBtn.setAttribute('aria-expanded', 'false');
        return;
    }

    try {
        state.versions = await store().listVersions(state.selectedFile);
        renderVersions();
        el.versionPanel.hidden = false;
        el.historyBtn.setAttribute('aria-expanded', 'true');
    } catch (error) {
        toast(error.message, 'error');
    }
});

function renderVersions() {
    el.versionList.textContent = '';

    if (state.versions.length === 0) {
        const p = document.createElement('p');
        p.className = 'empty-state';
        p.textContent = 'No earlier versions — this file has not been changed since it was created.';
        el.versionList.appendChild(p);
        return;
    }

    state.versions.forEach((version) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'version-row' + (version.stamp === state.viewingVersion ? ' is-active' : '');

        const when = document.createElement('span');
        when.textContent = 'Saved ' + relativeTime(version.saved);

        const size = document.createElement('span');
        size.className = 'version-size';
        size.textContent = formatBytes(version.size);

        row.append(when, size);
        row.addEventListener('click', () => previewVersion(version));
        el.versionList.appendChild(row);
    });
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function previewVersion(version) {
    try {
        const content = await store().readVersion(state.selectedFile, version.stamp);

        state.viewingVersion = version.stamp;
        state.viewedContent = content;

        renderViewerContent();

        el.versionBannerText.textContent = `Viewing a version saved ${relativeTime(version.saved)}.`;
        el.versionBanner.hidden = false;

        renderVersions();
    } catch (error) {
        toast(error.message, 'error');
    }
}

/* Restoring writes the old content back as a normal update — which snapshots
   the current content first, so a restore is itself undoable. */
el.versionRestoreBtn.addEventListener('click', async () => {
    const filename = state.selectedFile;
    const content = state.viewedContent;

    try {
        await store().update(filename, content, state.viewVersion);
        toast(`“${displayName(filename)}” restored to the earlier version.`);
        closeHistory();
        await viewFile(filename);
    } catch (error) {
        if (error.code === 'conflict') {
            closeHistory();
            await resolveConflict(filename, content, error.data);
        } else {
            toast(error.message, 'error');
        }
    }
});

el.versionBackBtn.addEventListener('click', () => {
    closeHistory();
    if (state.selectedFile) viewFile(state.selectedFile);
});

el.viewEditBtn.addEventListener('click', () => {
    if (state.selectedFile) editFile(state.selectedFile);
});

el.viewDownloadBtn.addEventListener('click', () => {
    if (state.selectedFile) downloadFile(state.selectedFile);
});
