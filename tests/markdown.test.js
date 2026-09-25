/**
 * Tests the markdown sanitiser in assets/js/markdown.js.
 *
 * Parsing itself is marked's job and is well covered upstream. What matters
 * here is the layer between marked and the page: marked does not sanitise,
 * so this allowlist is the only thing standing between a stored file and
 * script execution. Most cases below are attacks.
 *
 * The sanitiser is written against a plain DOM surface (childNodes /
 * attributes / remove / replaceWith / setAttribute), which lets these tests
 * drive it with the small shim below — no browser, no dependencies.
 *
 * Run with: npm test
 */
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'js', 'markdown.js'), 'utf8');

// Take the policy and the walker; skip the parts that need a real document
const start = source.indexOf('/** Tags marked can emit');
const end = source.indexOf('/* --------------------------------------------\n   Rendering');
if (start === -1 || end === -1) throw new Error('sanitiser markers not found in markdown.js');

global.window = {};

/*
 * eval hoists the function declarations (isSafeUrl, sanitizeNode) into this
 * scope, but keeps its own `const` bindings private — so the policy tables
 * are handed back through a returned object instead.
 */
const policy = eval(source.slice(start, end) + '\n({ ALLOWED_TAGS, ALLOWED_ATTRS })');
const ALLOWED_TAGS = policy.ALLOWED_TAGS;
const ALLOWED_ATTRS = policy.ALLOWED_ATTRS;

// --- DOM shim ------------------------------------------------------------
const TEXT = 3;
const ELEMENT = 1;

class Text {
    constructor(data) { this.nodeType = TEXT; this.data = data; }
    get outer() { return this.data; }
}

class Element {
    constructor(tag, attrs, kids) {
        this.nodeType = ELEMENT;
        this.tagName = tag;
        this.attributes = Object.keys(attrs || {}).map((name) => ({ name, value: attrs[name] }));
        this.childNodes = (kids || []).map((k) => (typeof k === 'string' ? new Text(k) : k));
        this.childNodes.forEach((k) => { k.parent = this; });
    }
    getAttribute(name) {
        const found = this.attributes.find((a) => a.name.toLowerCase() === name.toLowerCase());
        return found ? found.value : null;
    }
    setAttribute(name, value) {
        const found = this.attributes.find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (found) found.value = value;
        else this.attributes.push({ name, value });
    }
    removeAttribute(name) {
        this.attributes = this.attributes.filter((a) => a.name.toLowerCase() !== String(name).toLowerCase());
    }
    remove() {
        const at = this.parent.childNodes.indexOf(this);
        if (at !== -1) this.parent.childNodes.splice(at, 1);
    }
    replaceWith(...nodes) {
        const at = this.parent.childNodes.indexOf(this);
        if (at === -1) return;
        nodes.forEach((n) => { n.parent = this.parent; });
        this.parent.childNodes.splice(at, 1, ...nodes);
    }
    get outer() {
        const attrs = this.attributes.map((a) => ` ${a.name}="${a.value}"`).join('');
        const inner = this.childNodes.map((k) => k.outer).join('');
        return `<${this.tagName}${attrs}>${inner}</${this.tagName}>`;
    }
}

const h = (tag, attrs, ...kids) => new Element(tag, attrs, kids);
const body = (...kids) => new Element('body', {}, kids);

function clean(tree) {
    sanitizeNode(tree);
    return tree.childNodes.map((k) => k.outer).join('');
}

// --- cases ---------------------------------------------------------------
const cases = [
    // Kept as-is
    ['paragraph survives', body(h('p', {}, 'hello')), '<p>hello</p>'],
    ['emphasis survives', body(h('p', {}, h('strong', {}, 'bold'))), '<p><strong>bold</strong></p>'],
    ['table survives', body(h('table', {}, h('tr', {}, h('td', { align: 'center' }, 'x')))),
        '<table><tr><td align="center">x</td></tr></table>'],
    ['safe link kept', body(h('a', { href: 'https://example.com', title: 't' }, 'x')),
        '<a href="https://example.com" title="t">x</a>'],
    ['mailto kept', body(h('a', { href: 'mailto:a@b.c' }, 'mail')),
        '<a href="mailto:a@b.c">mail</a>'],
    ['fence language kept', body(h('pre', {}, h('code', { class: 'language-js' }, 'x'))),
        '<pre><code class="language-js">x</code></pre>'],
    ['ordered list start kept', body(h('ol', { start: '3' }, h('li', {}, 'a'))),
        '<ol start="3"><li>a</li></ol>'],
    ['task checkbox kept', body(h('input', { type: 'checkbox', checked: '' })),
        '<input type="checkbox" checked=""></input>'],

    // Attacks
    ['script removed with contents', body(h('script', {}, 'alert(1)')), ''],
    ['style removed', body(h('style', {}, 'body{}')), ''],
    ['iframe removed', body(h('iframe', { src: 'https://e.com' })), ''],
    ['svg removed', body(h('svg', {}, h('script', {}, 'x'))), ''],
    ['onerror stripped', body(h('img', { src: 'https://e.com/a.png', onerror: 'alert(1)' })),
        '<img src="https://e.com/a.png"></img>'],
    ['onclick stripped', body(h('p', { onclick: 'alert(1)' }, 'x')), '<p>x</p>'],
    ['onload stripped', body(h('p', { OnLoad: 'alert(1)' }, 'x')), '<p>x</p>'],
    ['javascript: href dropped', body(h('a', { href: 'javascript:alert(1)' }, 'x')), '<a>x</a>'],
    ['JaVaScRiPt: href dropped', body(h('a', { href: 'JaVaScRiPt:alert(1)' }, 'x')), '<a>x</a>'],
    ['tab-obfuscated javascript dropped', body(h('a', { href: 'java\tscript:alert(1)' }, 'x')), '<a>x</a>'],
    ['newline-obfuscated javascript dropped', body(h('a', { href: 'java\nscript:alert(1)' }, 'x')), '<a>x</a>'],
    ['leading-space javascript dropped', body(h('a', { href: '  javascript:alert(1)' }, 'x')), '<a>x</a>'],
    ['data: uri dropped', body(h('img', { src: 'data:text/html;base64,PHNjcmlwdD4=' })), '<img></img>'],
    ['vbscript: dropped', body(h('a', { href: 'vbscript:msgbox' }, 'x')), '<a>x</a>'],
    ['file: dropped', body(h('a', { href: 'file:///etc/passwd' }, 'x')), '<a>x</a>'],
    ['non-task input removed', body(h('input', { type: 'text', value: 'x' })), ''],
    ['form removed', body(h('form', { action: '/x' }, h('input', { type: 'checkbox' }))), ''],
    ['style attribute stripped', body(h('p', { style: 'position:fixed' }, 'x')), '<p>x</p>'],
    ['arbitrary class stripped', body(h('code', { class: 'evil' }, 'x')), '<code>x</code>'],
    ['id stripped', body(h('p', { id: 'x' }, 'y')), '<p>y</p>'],

    // Unknown-but-harmless tags keep their text
    ['unknown tag unwrapped', body(h('marquee', {}, 'text')), 'text'],
    ['nested unknown unwrapped', body(h('p', {}, h('font', { color: 'red' }, 'text'))), '<p>text</p>'],

    // Relative links are fine
    ['fragment kept', body(h('a', { href: '#section' }, 'x')), '<a href="#section">x</a>'],
    ['relative kept', body(h('a', { href: './notes.txt' }, 'x')), '<a href="./notes.txt">x</a>']
];

let pass = 0;
let fail = 0;

for (const [name, tree, expected] of cases) {
    let got;
    try {
        got = clean(tree);
    } catch (e) {
        got = 'THREW: ' + e.message;
    }
    if (got === expected) {
        pass++;
    } else {
        fail++;
        console.log(`FAIL ${name}\n  want: ${expected}\n  got:  ${got}`);
    }
}

// isSafeUrl in isolation — every one of these must be refused
const unsafe = [
    'javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:x', 'java\u0000script:x',
    'data:text/html,<script>', 'vbscript:x', 'file:///c:/', 'jAvAsCrIpT:x'
];
unsafe.forEach((u) => {
    if (isSafeUrl(u)) {
        fail++;
        console.log(`FAIL isSafeUrl allowed ${JSON.stringify(u)}`);
    } else {
        pass++;
    }
});

const safe = ['https://a.b', 'http://a.b', 'mailto:a@b.c', '#x', '/x', './x', '../x', 'notes.txt'];
safe.forEach((u) => {
    if (!isSafeUrl(u)) {
        fail++;
        console.log(`FAIL isSafeUrl refused ${JSON.stringify(u)}`);
    } else {
        pass++;
    }
});

/*
 * Coverage: everything marked emits must be on the allowlist.
 *
 * If a marked upgrade starts producing a new tag or attribute, the sanitiser
 * would quietly strip it and the formatting would vanish from the preview.
 * This catches that at build time rather than in someone's document.
 *
 * (marked passes raw HTML through untouched — verified separately — which is
 * why the sanitiser exists at all.)
 */
const markedModule = require('../assets/vendor/marked.min.js');
const marked = markedModule.marked || markedModule;
marked.setOptions({ gfm: true, breaks: true });

const kitchenSink = [
    '# H1', '## H2', '',
    'Para with **bold**, *em*, ~~strike~~, `code`, [link](https://e.com).', '',
    '- bullet', '- [ ] task', '- [x] done', '',
    '1. one', '2. two', '',
    '> quote', '',
    '| a | b |', '|:--|--:|', '| 1 | 2 |', '',
    '```js', 'x = 1', '```', '',
    '---', '![img](https://e.com/a.png)', '', '<https://auto.link>'
].join('\n');

const emitted = marked.parse(kitchenSink);

const tags = [...new Set([...emitted.matchAll(/<([a-z0-9]+)[ >]/gi)].map((m) => m[1].toLowerCase()))];
const attrs = [...new Set([...emitted.matchAll(/ ([a-z-]+)="/gi)].map((m) => m[1].toLowerCase()))];

tags.forEach((tag) => {
    if (ALLOWED_TAGS.has(tag)) {
        pass++;
    } else {
        fail++;
        console.log(`FAIL marked emits <${tag}> but the allowlist drops it`);
    }
});

const everyAllowedAttr = new Set(Object.values(ALLOWED_ATTRS).flat());
attrs.forEach((attr) => {
    if (everyAllowedAttr.has(attr)) {
        pass++;
    } else {
        fail++;
        console.log(`FAIL marked emits ${attr}="..." but the allowlist strips it`);
    }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
