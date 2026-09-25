/* ============================================
   boot.js — Mode detection and start-up sequencing.
   ============================================ */

function setMode(isServer) {
    state.isServerMode = isServer;
    el.modeIndicator.className = 'mode-pill ' + (isServer ? 'server-mode' : 'local-mode');
    el.modeText.textContent = isServer ? 'Server storage' : 'Browser storage';
    el.modeIndicator.title = isServer
        ? 'Server mode — files are saved on the server in datasets/'
        : 'Local mode — files are saved in this browser only (localStorage)';
    // Password management only exists where there is a password
    el.logoutBtn.hidden = !isServer;
    el.adminBtn.hidden = !isServer;
}

/**
 * Decides which of three states the app starts in:
 *   no server            -> local mode
 *   server, no password  -> first-run setup
 *   server, signed out   -> sign-in
 */
/** Everything that runs once the storage mode is settled. */
async function enterApp() {
    await loadFiles();
    restoreNewFileDraft();
    offerMigration();
}

async function boot() {
    let status;
    try {
        status = await apiGet({ action: 'status' });
    } catch (e) {
        setMode(false);            // no reachable backend — browser storage it is
        await enterApp();
        return;
    }

    if (!status.configured) {
        openAuthGate('setup');
        return;
    }

    if (!status.authenticated) {
        openAuthGate('login');
        return;
    }

    state.csrf = status.csrf || '';
    setMode(true);
    await enterApp();
}
