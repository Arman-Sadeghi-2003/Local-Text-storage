/* ============================================
   ui.js — Toasts, the confirm dialog, and tab switching.
   ============================================ */

/**
 * @param action optional {label, onClick} — renders a button inside the toast,
 *               used for Undo after a delete. Action toasts linger longer.
 */
function toast(message, type = 'success', action = null) {
    const node = document.createElement('div');
    node.className = `toast ${type}`;

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = type === 'error' ? '⚠️' : '✅';

    const body = document.createElement('div');
    body.className = 'toast-body';

    const text = document.createElement('span');
    text.textContent = message;
    body.appendChild(text);

    if (action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'toast-action';
        button.textContent = action.label;
        button.addEventListener('click', () => {
            dismiss();
            action.onClick();
        });
        body.appendChild(button);
    }

    node.append(icon, body);
    el.toasts.appendChild(node);

    let dismissed = false;
    function dismiss() {
        if (dismissed) return;
        dismissed = true;
        node.classList.add('is-leaving');
        node.addEventListener('animationend', () => node.remove(), { once: true });
    }

    setTimeout(dismiss, action ? 8000 : (type === 'error' ? 5000 : 3000));
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
