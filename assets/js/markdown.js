/* ============================================
   markdown.js — Markdown rendering and preview toggle.

   Parsing is marked v15 (assets/vendor/marked.min.js), taken from the
   MarkdownReader project. It gives full GFM — tables, task lists, nested
   lists, autolinks, reference links, setext headings — which the previous
   hand-written parser did not.

   marked does NOT sanitize; its own docs point at DOMPurify. Since files
   here are user content and can arrive from imported bundles, its HTML is
   parsed into an inert document and filtered against an allowlist before
   anything reaches the page. Nothing is ever assigned to innerHTML.

   Covered by tests/markdown.test.js.
   ============================================ */

if (window.marked) {
    marked.setOptions({ gfm: true, breaks: true });
}

/* --------------------------------------------
   Sanitiser policy
   -------------------------------------------- */

/** Tags marked can emit that are safe to keep. */
const ALLOWED_TAGS = new Set([
    'p', 'br', 'hr', 'blockquote', 'pre', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'del',
    'ul', 'ol', 'li', 'input',
    'a', 'img',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td'
]);

/** Attributes kept per tag. Everything else goes, which kills every on* handler. */
const ALLOWED_ATTRS = {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title'],
    ol: ['start'],
    th: ['align'],
    td: ['align'],
    code: ['class'],                       // language-xxx from fenced blocks
    input: ['type', 'checked', 'disabled'] // task-list checkboxes
};

/**
 * Tags removed with their contents. Everything else that is merely not on
 * the allowlist is unwrapped instead, so text is never silently lost.
 */
const DROP_ENTIRELY = new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'applet',
    'form', 'button', 'select', 'textarea',
    'link', 'meta', 'base', 'template', 'svg', 'math', 'frame', 'frameset'
]);

/** Only web-navigable schemes. Blocks javascript:, data:, vbscript:, file:. */
function isSafeUrl(value) {
    // Control characters go first: "java&#9;script:" is still javascript:
    const bare = String(value || '')
        .replace(/[\u0000-\u0020\u007f-\u00a0]/g, '')
        .toLowerCase();

    if (bare.startsWith('#') || bare.startsWith('/') || bare.startsWith('./') || bare.startsWith('../')) {
        return true;
    }
    if (/^(https?|mailto):/.test(bare)) {
        return true;
    }
    // A bare word with no scheme is a relative path
    return !/^[a-z0-9.+-]*:/.test(bare);
}

/** Keeps only `language-foo` so a fence cannot smuggle arbitrary classes. */
function safeCodeClass(value) {
    return String(value || '')
        .split(/\s+/)
        .filter((c) => /^language-[a-z0-9_+-]+$/i.test(c))
        .join(' ');
}

/**
 * Recursively filters a parsed tree in place.
 *
 * Written against the plain DOM surface (childNodes / attributes / remove /
 * replaceWith) so tests can drive it with a small shim.
 */
function sanitizeNode(node) {
    Array.from(node.childNodes || []).forEach((child) => {
        // Text is always fine; comments and anything exotic are dropped
        if (child.nodeType === 3) return;
        if (child.nodeType !== 1) {
            child.remove();
            return;
        }

        const tag = String(child.tagName || '').toLowerCase();

        if (DROP_ENTIRELY.has(tag)) {
            child.remove();
            return;
        }

        // The only <input> markdown produces is an inert task-list checkbox
        if (tag === 'input' && !isTaskCheckbox(child)) {
            child.remove();
            return;
        }

        if (!ALLOWED_TAGS.has(tag)) {
            sanitizeNode(child);                       // keep the contents
            child.replaceWith(...Array.from(child.childNodes || []));
            return;
        }

        const allowed = ALLOWED_ATTRS[tag] || [];

        Array.from(child.attributes || []).forEach((attr) => {
            const name = String(attr.name || '').toLowerCase();

            if (!allowed.includes(name)) {
                child.removeAttribute(attr.name);
                return;
            }

            if ((name === 'href' || name === 'src') && !isSafeUrl(attr.value)) {
                child.removeAttribute(attr.name);
                return;
            }

            if (name === 'class') {
                const cleaned = safeCodeClass(attr.value);
                if (cleaned) {
                    child.setAttribute('class', cleaned);
                } else {
                    child.removeAttribute('class');
                }
            }
        });

        sanitizeNode(child);
    });
}

/** Task-list checkboxes are the one <input> marked produces, and they are inert. */
function isTaskCheckbox(node) {
    const type = node.getAttribute && node.getAttribute('type');
    return String(type || '').toLowerCase() === 'checkbox';
}

/* --------------------------------------------
   Rendering
   -------------------------------------------- */

/**
 * Renders markdown into `container`.
 *
 * DOMParser builds an inert document: no scripts run, no images load, and
 * nothing touches the live page until after sanitising.
 */
function renderMarkdown(text, container) {
    container.textContent = '';

    if (!window.marked) {
        container.textContent = text;              // vendor script missing
        return;
    }

    let parsed;
    try {
        parsed = marked.parse(text);
    } catch (error) {
        container.textContent = text;              // fall back to the raw file
        return;
    }

    const doc = new DOMParser().parseFromString('<!doctype html><body>' + parsed, 'text/html');
    sanitizeNode(doc.body);

    Array.from(doc.body.childNodes).forEach((node) => {
        container.appendChild(document.importNode(node, true));
    });

    decorateRendered(container);
}

/** Post-processing that is easier on the live tree than on the parsed one. */
function decorateRendered(container) {
    // Wide tables scroll on their own rather than stretching the panel
    container.querySelectorAll('table').forEach((table) => {
        if (table.parentElement && table.parentElement.classList.contains('table-wrap')) return;

        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
    });

    // Links leave the app in a new tab, with no window.opener handle
    container.querySelectorAll('a[href]').forEach((link) => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    });

    // Task-list checkboxes are display only
    container.querySelectorAll('input[type="checkbox"]').forEach((box) => {
        box.disabled = true;
    });
}

/* --------------------------------------------
   Preview toggle
   -------------------------------------------- */

function setMarkdownMode(on) {
    state.markdown = on;

    el.markdownBtn.setAttribute('aria-pressed', String(on));
    el.markdownBtn.classList.toggle('is-active', on);

    try {
        localStorage.setItem('markdownPreview', on ? '1' : '0');
    } catch (e) { /* storage may be unavailable */ }

    renderViewerContent();
}

/** Paints the viewer in whichever mode is active. */
function renderViewerContent() {
    const content = state.viewedContent;

    if (state.markdown && content) {
        renderMarkdown(content, el.markdownView);
        el.markdownView.hidden = false;
        el.fileViewer.hidden = true;
    } else {
        el.fileViewer.textContent = content || '(empty file)';
        el.fileViewer.classList.toggle('is-empty', !content);
        el.fileViewer.hidden = false;
        el.markdownView.hidden = true;
    }
}

el.markdownBtn.addEventListener('click', () => setMarkdownMode(!state.markdown));

function initMarkdownPreference() {
    let saved = null;
    try {
        saved = localStorage.getItem('markdownPreview');
    } catch (e) { /* ignore */ }

    state.markdown = saved === '1';
    el.markdownBtn.setAttribute('aria-pressed', String(state.markdown));
    el.markdownBtn.classList.toggle('is-active', state.markdown);
}
