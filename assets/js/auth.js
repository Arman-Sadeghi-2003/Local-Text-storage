/* ============================================
   auth.js — Sign in, first-run setup, sign out, and the admin panel.

   Three separate surfaces rather than one form with mode flags:

     #authGate   sign in       — one password field, always
     #setupGate  first run     — new + confirm, the only place a password can
                                 be created before one exists
     #adminPanel change/remove — where an existing password is managed

   Keeping them apart is what stops setup fields appearing on the sign-in
   card, which is exactly what the shared-form version did.
   ============================================ */

/**
 * @param mode 'login' or 'setup' — chooses which gate to show.
 *             Call sites in boot.js and stores.js pass this through.
 */
function openAuthGate(mode, message = '') {
    closeAdminPanel();

    if (mode === 'setup') {
        el.authGate.hidden = true;
        el.setupPassword.value = '';
        el.setupConfirm.value = '';
        setFieldError(el.setupError, message);
        el.setupGate.hidden = false;
        el.setupPassword.focus();
        return;
    }

    el.setupGate.hidden = true;
    el.authPassword.value = '';
    setFieldError(el.authError, message);
    el.authGate.hidden = false;
    el.authPassword.focus();
}

function closeAuthGate() {
    el.authGate.hidden = true;
    el.setupGate.hidden = true;

    el.authPassword.value = '';
    el.setupPassword.value = '';
    el.setupConfirm.value = '';

    setFieldError(el.authError, '');
    setFieldError(el.setupError, '');
}

/** True while either gate is covering the app. */
function authGateIsOpen() {
    return !el.authGate.hidden || !el.setupGate.hidden;
}

function setFieldError(node, message) {
    node.textContent = message;
    node.hidden = !message;
}

/** Shared tail of a successful sign-in or setup. */
async function completeSignIn(csrf, message) {
    state.csrf = csrf || '';
    closeAuthGate();
    setMode(true);
    toast(message);
    await enterApp();
}

/* --------------------------------------------
   Sign in
   -------------------------------------------- */

el.authForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = el.authPassword.value;
    if (!password) {
        setFieldError(el.authError, 'Please enter your password.');
        return;
    }

    el.authSubmit.disabled = true;
    setFieldError(el.authError, '');

    try {
        const data = await apiPost('login', { password });
        await completeSignIn(data.csrf, 'Signed in.');
    } catch (error) {
        setFieldError(el.authError, error.message);
        el.authPassword.select();
    } finally {
        el.authSubmit.disabled = false;
    }
});

/* --------------------------------------------
   First-run setup
   -------------------------------------------- */

el.setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = el.setupPassword.value;
    const confirm = el.setupConfirm.value;

    if (password.length < MIN_PASSWORD_LENGTH) {
        setFieldError(el.setupError, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
    }
    if (password !== confirm) {
        setFieldError(el.setupError, 'The two passwords do not match.');
        el.setupConfirm.focus();
        return;
    }

    el.setupSubmit.disabled = true;
    setFieldError(el.setupError, '');

    try {
        const data = await apiPost('setup', { password });
        await completeSignIn(data.csrf, 'Password created. You are signed in.');
    } catch (error) {
        setFieldError(el.setupError, error.message);
    } finally {
        el.setupSubmit.disabled = false;
    }
});

/* Escape hatch on both gates: use the browser-only store instead */
async function useBrowserStorage() {
    closeAuthGate();
    setMode(false);
    toast('Using browser storage. Files stay on this device.');
    await enterApp();
}

el.authLocalBtn.addEventListener('click', useBrowserStorage);
el.setupLocalBtn.addEventListener('click', useBrowserStorage);

/* --------------------------------------------
   Admin panel
   -------------------------------------------- */

function openAdminPanel() {
    el.adminCurrent.value = '';
    el.adminNew.value = '';
    el.adminConfirm.value = '';
    el.adminRemovePassword.value = '';

    setFieldError(el.adminError, '');
    setFieldError(el.adminRemoveError, '');

    el.adminBackdrop.hidden = false;
    el.adminCurrent.focus();
}

function closeAdminPanel() {
    if (el.adminBackdrop.hidden) return;

    // Clear the fields on the way out rather than leaving passwords in the DOM
    el.adminCurrent.value = '';
    el.adminNew.value = '';
    el.adminConfirm.value = '';
    el.adminRemovePassword.value = '';

    el.adminBackdrop.hidden = true;
}

el.adminBtn.addEventListener('click', openAdminPanel);
el.adminCloseBtn.addEventListener('click', closeAdminPanel);

el.adminBackdrop.addEventListener('click', (e) => {
    if (e.target === el.adminBackdrop) closeAdminPanel();
});

el.passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const current = el.adminCurrent.value;
    const next = el.adminNew.value;

    if (!current) {
        setFieldError(el.adminError, 'Enter your current password.');
        el.adminCurrent.focus();
        return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
        setFieldError(el.adminError, `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        el.adminNew.focus();
        return;
    }
    if (next !== el.adminConfirm.value) {
        setFieldError(el.adminError, 'The two new passwords do not match.');
        el.adminConfirm.focus();
        return;
    }
    if (next === current) {
        setFieldError(el.adminError, 'The new password is the same as the current one.');
        el.adminNew.focus();
        return;
    }

    el.adminSubmit.disabled = true;
    setFieldError(el.adminError, '');

    try {
        // The server issues a fresh token, so the old one stops working here too
        const data = await apiPost('password_change', { current, password: next });
        state.csrf = data.csrf || '';

        closeAdminPanel();
        toast('Password changed. Other sessions have been signed out.');
    } catch (error) {
        setFieldError(el.adminError, error.message);
    } finally {
        el.adminSubmit.disabled = false;
    }
});

el.adminRemoveBtn.addEventListener('click', async () => {
    const current = el.adminRemovePassword.value;

    if (!current) {
        setFieldError(el.adminRemoveError, 'Enter your current password to confirm.');
        el.adminRemovePassword.focus();
        return;
    }

    const confirmed = await confirmDialog(
        'Remove the password?',
        'Everyone is signed out and the server is left unclaimed — the next person to open the app can set a new password and reach every file.',
        'Remove it'
    );
    if (!confirmed) return;

    el.adminRemoveBtn.disabled = true;
    setFieldError(el.adminRemoveError, '');

    try {
        await apiPost('password_remove', { current });

        closeAdminPanel();
        resetToSignedOut();
        toast('Password removed. This server is now unprotected.', 'error');

        // No password exists, so the setup screen is the only way back in
        openAuthGate('setup');
    } catch (error) {
        setFieldError(el.adminRemoveError, error.message);
    } finally {
        el.adminRemoveBtn.disabled = false;
    }
});

/* --------------------------------------------
   Sign out
   -------------------------------------------- */

/** Drops every trace of the session from the running app. */
function resetToSignedOut() {
    state.csrf = '';
    state.files = [];
    state.trash = [];

    clearViewer();
    exitEditMode();
    setView('files');
}

el.logoutBtn.addEventListener('click', async () => {
    const confirmed = await confirmDialog(
        'Sign out?',
        'You will need your password to get back in.',
        'Sign out'
    );
    if (!confirmed) return;

    try {
        await apiPost('logout');
    } catch (e) {
        /* signing out locally is what matters */
    }

    resetToSignedOut();
    openAuthGate('login');
});
