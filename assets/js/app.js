/* ============================================
   app.js — Theme, keyboard shortcuts, and application start.

   Loaded last: the start-up calls at the bottom need every other module.
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
    // While a sign-in gate is up, the app shortcuts are inert
    if (authGateIsOpen()) return;

    // Escape closes whichever dialog is open, innermost first
    if (e.key === 'Escape' && !el.conflictBackdrop.hidden) {
        e.preventDefault();
        closeConflict('cancel');
        return;
    }

    if (e.key === 'Escape' && !el.confirmBackdrop.hidden) {
        e.preventDefault();
        closeConfirm(false);
        return;
    }

    if (e.key === 'Escape' && !el.adminBackdrop.hidden) {
        e.preventDefault();
        closeAdminPanel();
        return;
    }

    // The admin panel owns the keyboard while it is open
    if (!el.adminBackdrop.hidden) return;

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

/* No unload prompt: the editor buffer is autosaved as a draft and offered
   back on return, which protects the work without nagging on every exit. */

/* ============================================
   Start
   ============================================ */

/**
 * Registers the offline shell. Skipped on file:// (no service worker) and
 * on insecure origins, where registration would only throw.
 */
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;

    navigator.serviceWorker.register('sw.js').catch(() => {
        /* offline support is a bonus, never a requirement */
    });
}

initTheme();
initMarkdownPreference();
clearViewer();
updateFilenameHint();
updateCounter();
registerServiceWorker();
boot();
