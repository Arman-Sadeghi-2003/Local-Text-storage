/**
 * Guards the file layout.
 *
 * The front end is split across classic <script> tags rather than ES modules
 * (modules are blocked by CORS on file://, and opening index.html from disk
 * is supported). That buys file:// support at the cost of two hazards this
 * file checks for:
 *
 *   - a module added to assets/ but never referenced, or referenced but
 *     missing — silent breakage, since nothing resolves imports;
 *   - two modules declaring the same top-level name, which throws at load
 *     because classic scripts share one global scope.
 *
 * It also keeps sw.js and the manifest honest about what they point at.
 *
 * Run with: npm test
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

let failures = 0;

function check(label, condition, detail) {
    if (condition) return;
    failures++;
    console.log(`FAIL ${label}${detail ? '\n      ' + detail : ''}`);
}

// ---- what index.html pulls in -------------------------------------------
const html = read('index.html');

const cssRefs = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]);
const jsRefs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);

cssRefs.concat(jsRefs).forEach((ref) => {
    check(`index.html references ${ref}`, exists(ref), 'file does not exist');
});

// ---- no orphans ----------------------------------------------------------
const cssFiles = fs.readdirSync(path.join(ROOT, 'assets/css')).map((f) => 'assets/css/' + f);
const jsFiles = fs.readdirSync(path.join(ROOT, 'assets/js')).map((f) => 'assets/js/' + f);
const vendorFiles = fs.readdirSync(path.join(ROOT, 'assets/vendor')).map((f) => 'assets/vendor/' + f);

cssFiles.forEach((f) => check(`${f} is linked`, cssRefs.includes(f), 'not referenced by index.html'));
jsFiles.forEach((f) => check(`${f} is loaded`, jsRefs.includes(f), 'not referenced by index.html'));
vendorFiles.forEach((f) => check(`${f} is loaded`, jsRefs.includes(f), 'not referenced by index.html'));

// ---- load order ----------------------------------------------------------
const ownScripts = jsRefs.filter((r) => r.startsWith('assets/js/'));

check('core.js loads first', ownScripts[0] === 'assets/js/core.js', `first module is ${ownScripts[0]}`);
check('app.js loads last', ownScripts[ownScripts.length - 1] === 'assets/js/app.js',
    `last module is ${ownScripts[ownScripts.length - 1]}`);

// markdown.js calls marked.setOptions at load, so the vendor script must precede it
check('marked loads before markdown.js',
    jsRefs.indexOf('assets/vendor/marked.min.js') < jsRefs.indexOf('assets/js/markdown.js'),
    'markdown.js configures marked at load time');

// ---- every module parses -------------------------------------------------
jsFiles.forEach((f) => {
    try {
        execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' });
    } catch (e) {
        check(`${f} parses`, false, String(e.stderr || e.message).split('\n')[0]);
    }
});

// ---- one global scope, so top-level names must be unique ------------------
const declared = new Map();

jsFiles.forEach((f) => {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    const names = [...src.matchAll(/^(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm)]
        .map((m) => m[1]);

    names.forEach((name) => {
        if (declared.has(name)) {
            check(`"${name}" declared once`, false,
                `also declared in ${declared.get(name)} — classic scripts share a global scope`);
        } else {
            declared.set(name, f);
        }
    });
});

// ---- stored text must never become markup -------------------------------
// Every renderer builds nodes; innerHTML would reopen the injection hole.
jsFiles.forEach((f) => {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check(`${f} avoids innerHTML`, !/\.innerHTML\s*=/.test(src),
        'assign via textContent or build nodes instead');
    check(`${f} avoids insertAdjacentHTML`, !/insertAdjacentHTML/.test(src),
        'build nodes instead');
});

// ---- service worker and manifest ----------------------------------------
const sw = read('sw.js');
const shell = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);

shell.forEach((p) => check(`sw.js caches ${p}`, exists(p), 'file does not exist'));
jsFiles.concat(cssFiles, vendorFiles).forEach((f) =>
    check(`sw.js caches ${f}`, shell.includes(f), 'missing from the SHELL list'));

check('sw.js never caches the API', !/api\.php'/.test(sw.replace(/endsWith\('\/api\.php'\)/, '')),
    'api.php appears in the cache list');

const manifest = JSON.parse(read('manifest.webmanifest'));
manifest.icons.forEach((icon) =>
    check(`manifest icon ${icon.src}`, exists(icon.src), 'file does not exist'));

// ---- php modules are guarded --------------------------------------------
fs.readdirSync(path.join(ROOT, 'lib')).forEach((f) => {
    check(`lib/${f} refuses direct execution`, /defined\('TFS_APP'\)\s+or\s+exit;/.test(read('lib/' + f)),
        'missing the TFS_APP guard');
});

const api = read('api.php');
fs.readdirSync(path.join(ROOT, 'lib')).forEach((f) => {
    check(`api.php requires lib/${f}`, api.includes(`/lib/${f}'`), 'not required by api.php');
});

// ---- auth surfaces stay separate ----------------------------------------
/*
 * These three screens were once one form driven by a mode flag, which let
 * the setup fields surface on the sign-in card. Splitting them fixed it;
 * these checks stop them merging back.
 */
function sectionOf(id) {
    const at = html.indexOf(`id="${id}"`);
    if (at === -1) return '';

    // Up to the start of the next top-level overlay
    const rest = html.slice(at);
    const next = rest.slice(1).search(/\n    <!--|\n    <div id="/);
    return next === -1 ? rest : rest.slice(0, next + 1);
}

const passwordInputs = (id) =>
    (sectionOf(id).match(/type="password"/g) || []).length;

check('sign-in card has exactly one password field', passwordInputs('authGate') === 1,
    `found ${passwordInputs('authGate')} — creating or changing a password belongs elsewhere`);
check('setup card confirms the new password', passwordInputs('setupGate') === 2,
    `found ${passwordInputs('setupGate')}`);
check('admin panel takes current + new + confirm', passwordInputs('adminBackdrop') === 4,
    `found ${passwordInputs('adminBackdrop')} (3 to change, 1 to remove)`);

['setupGate', 'adminBackdrop', 'adminBtn'].forEach((id) =>
    check(`index.html has #${id}`, html.includes(`id="${id}"`), 'missing'));

// ---- password actions exist server-side ---------------------------------
['password_change', 'password_remove'].forEach((action) =>
    check(`api.php handles ${action}`, api.includes(`case '${action}':`), 'action not routed'));

check('password removal is possible', read('lib/settings.php').includes('function config_clear'),
    'config_clear is missing');

// ---- no duplicate php functions -----------------------------------------
const phpNames = new Map();
fs.readdirSync(path.join(ROOT, 'lib')).forEach((f) => {
    [...read('lib/' + f).matchAll(/^function\s+(\w+)/gm)].forEach((m) => {
        if (phpNames.has(m[1])) {
            check(`php "${m[1]}" defined once`, false, `also in lib/${phpNames.get(m[1])}`);
        } else {
            phpNames.set(m[1], f);
        }
    });
});

console.log(failures === 0
    ? `structure OK — ${jsFiles.length} modules, ${cssFiles.length} stylesheets, ${phpNames.size} php functions`
    : `\n${failures} structural problem${failures === 1 ? '' : 's'}`);

process.exit(failures ? 1 : 0);
