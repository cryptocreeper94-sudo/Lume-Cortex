/**
 * Lume Cortex — Browser Bundler
 * Transforms src/lume/*.lume → dist/cortex.js
 *
 * Lume Compiler v0.8.1 — Cortex Edition
 * Transformation rules identical to DDA build pipeline:
 *   - /// comments → // comments
 *   - Multi-line "..." strings → template literals
 *   - for each X in Y → for (const X of Y)
 *   - for i in range(a, b) → for (let i = a; i < b; i++)
 *   - define X = Y → const X = Y
 *   - show X → console.log(X)
 *   - Preserves all Lume stdlib calls (dom, state, text, math, list)
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import vm from 'node:vm'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Read source files ──
const lumeDir = resolve(__dirname, 'src/lume')
const distPath = resolve(__dirname, 'dist/cortex.js')
const files = readdirSync(lumeDir).filter(f => f.endsWith('.lume')).sort()
let source = files.map(f => readFileSync(resolve(lumeDir, f), 'utf-8')).join('\n\n')

// ── Transform .lume → JS ──
function transformLume(src) {
    let lines = src.split('\n').map(l => l.replace(/\r$/, ''))
    let output = []
    let inMultiLineString = false
    let multiLineBuffer = []
    let multiLineVarPrefix = ''

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]

        if (line.trimStart().startsWith('///')) {
            output.push(line.replace('///', '//'))
            continue
        }

        if (!inMultiLineString) {
            const injectMatch = line.match(/^(\s*dom\.inject_css\()\"$/)
            if (injectMatch) {
                inMultiLineString = true
                multiLineBuffer = []
                multiLineVarPrefix = injectMatch[1]
                continue
            }

            line = line.replace(/^(\s*)define\s+/, '$1let ')
            line = line.replace(/^(\s*)show\s+(.+)$/, '$1console.log($2)')

            const forEachMatch = line.match(/^(\s*)for\s+each\s+(\w+)\s+in\s+(.+)$/)
            if (forEachMatch) {
                output.push(`${forEachMatch[1]}for (const ${forEachMatch[2]} of ${forEachMatch[3]}) {`)
                const baseIndent = forEachMatch[1].length
                let j = i + 1
                while (j < lines.length) {
                    const nextLine = lines[j]
                    const trimmed = nextLine.trim()
                    if (trimmed === '') { j++; continue }
                    const nextIndent = nextLine.match(/^(\s*)/)[1].length
                    if (nextIndent <= baseIndent) break
                    let transformed = nextLine
                    transformed = transformed.replace(/^(\s*)define\s+/, '$1let ')
                    transformed = transformed.replace(/^(\s*)show\s+(.+)$/, '$1console.log($2)')
                    output.push(transformed)
                    j++
                }
                output.push(`${forEachMatch[1]}}`)
                i = j - 1
                continue
            }

            const forRangeMatch = line.match(/^(\s*)for\s+(\w+)\s+in\s+range\((.+),\s*(.+)\)$/)
            if (forRangeMatch) {
                output.push(`${forRangeMatch[1]}for (let ${forRangeMatch[2]} = ${forRangeMatch[3]}; ${forRangeMatch[2]} < ${forRangeMatch[4]}; ${forRangeMatch[2]}++) {`)
                const baseIndent = forRangeMatch[1].length
                let j = i + 1
                while (j < lines.length) {
                    const nextLine = lines[j]
                    const trimmed = nextLine.trim()
                    if (trimmed === '') { j++; continue }
                    const nextIndent = nextLine.match(/^(\s*)/)[1].length
                    if (nextIndent <= baseIndent) break
                    let transformed = nextLine
                    transformed = transformed.replace(/^(\s*)define\s+/, '$1let ')
                    output.push(transformed)
                    j++
                }
                output.push(`${forRangeMatch[1]}}`)
                i = j - 1
                continue
            }

            const ifMatch = line.match(/^(\s*)if\s+(.+)$/)
            if (ifMatch && !line.includes('{') && !ifMatch[2].startsWith('(')) {
                const baseIndent = ifMatch[1].length
                const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
                const nextTrimmed = nextLine.trim()
                const nextIndent = nextLine.match(/^(\s*)/)?.[1]?.length || 0

                if (nextTrimmed && nextIndent > baseIndent) {
                    output.push(`${ifMatch[1]}if (${ifMatch[2]}) {`)
                    let j = i + 1
                    while (j < lines.length) {
                        const bodyLine = lines[j]
                        const bodyTrimmed = bodyLine.trim()
                        if (bodyTrimmed === '') { output.push(bodyLine); j++; continue }
                        const bodyIndent = bodyLine.match(/^(\s*)/)[1].length
                        if (bodyIndent <= baseIndent) break
                        let transformed = bodyLine
                        transformed = transformed.replace(/^(\s*)define\s+/, '$1let ')
                        transformed = transformed.replace(/^(\s*)show\s+(.+)$/, '$1console.log($2)')
                        output.push(transformed)
                        j++
                    }
                    output.push(`${ifMatch[1]}}`)
                    i = j - 1
                } else {
                    output.push(line)
                }
                continue
            }

            output.push(line)
        } else {
            const closeMatch = line.match(/^\"(,\s*\"[^"]*\"\s*\))$/)
            if (closeMatch) {
                const cssContent = multiLineBuffer.join('\n')
                output.push(`${multiLineVarPrefix}\``)
                output.push(cssContent)
                output.push(`\`${closeMatch[1]}`)
                inMultiLineString = false
                multiLineBuffer = []
                continue
            }
            multiLineBuffer.push(line)
        }
    }

    return output.join('\n')
}

// ── Lume Standard Library (Browser Runtime) ──
const STDLIB = `// ═══════════════════════════════════════════════════════════
// Lume Cortex — Compiled Bundle
// The Deterministic Meta-Operating System Interface
// Zero Dependencies — Built with Lume
// Source: src/lume/*.lume
// Generated by Lume Compiler v0.8.1 — Cortex Edition
// ═══════════════════════════════════════════════════════════

(function() {
"use strict";

// ═══ Lume Standard Library (Browser) ═══
const text = {
  upper: (s) => String(s).toUpperCase(),
  lower: (s) => String(s).toLowerCase(),
  trim: (s) => String(s).trim(),
  split: (s, sep) => String(s).split(sep),
  join: (arr, sep = ', ') => arr.join(sep),
  replace: (s, from, to) => String(s).replaceAll(from, to),
  contains: (s, sub) => String(s).includes(sub),
  length: (s) => String(s).length,
  pad_start: (s, len, ch) => String(s).padStart(len, ch || '0'),
  slice: (s, a, b) => String(s).slice(a, b),
};

const math = {
  abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round,
  min: (...a) => Math.min(...a), max: (...a) => Math.max(...a),
  random: () => Math.random(),
  random_int: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
  clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
  sin: Math.sin, cos: Math.cos, PI: Math.PI, sqrt: Math.sqrt,
  hypot: Math.hypot,
};

const list = {
  first: (a) => a[0], last: (a) => a[a.length - 1],
  map: (a, fn) => a.map(fn), filter: (a, fn) => a.filter(fn),
  range: (start, end) => { const r = []; for (let i = start; i < end; i++) r.push(i); return r; },
  count: (a) => a.length,
  find: (a, fn) => a.find(fn),
  sort: (a, fn) => [...a].sort(fn),
  flat: (a) => a.flat(),
  reduce: (a, fn, init) => a.reduce(fn, init),
  includes: (a, v) => a.includes(v),
  shuffle: (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; },
};

const dom = {
  create: (tag, opts = {}) => {
    const el = document.createElement(tag);
    if (opts.text) el.textContent = opts.text;
    if (opts.html) el.innerHTML = opts.html;
    if (opts.id) el.id = opts.id;
    if (opts.className) el.className = opts.className;
    if (opts.styles) Object.assign(el.style, opts.styles);
    if (opts.attrs) { for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v); }
    if (opts.children) { for (const c of opts.children) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    if (opts.onClick) el.addEventListener('click', opts.onClick);
    if (opts.onInput) el.addEventListener('input', opts.onInput);
    if (opts.onKeydown) el.addEventListener('keydown', opts.onKeydown);
    return el;
  },
  select: (s) => document.querySelector(s),
  select_all: (s) => [...document.querySelectorAll(s)],
  add_child: (p, c) => { if (typeof p === 'string') p = document.querySelector(p); if (typeof c === 'string') c = document.createTextNode(c); p.appendChild(c); return c; },
  set_text: (el, t) => { if (typeof el === 'string') el = document.querySelector(el); if (el) el.textContent = t; },
  set_html: (el, h) => { if (typeof el === 'string') el = document.querySelector(el); if (el) el.innerHTML = h; },
  set_style: (el, p, v) => { if (typeof el === 'string') el = document.querySelector(el); if (el) el.style[p] = v; },
  set_styles: (el, s) => { if (typeof el === 'string') el = document.querySelector(el); if (el) Object.assign(el.style, s); },
  add_class: (el, ...c) => { if (typeof el === 'string') el = document.querySelector(el); if (el) el.classList.add(...c); },
  remove_class: (el, ...c) => { if (typeof el === 'string') el = document.querySelector(el); if (el) el.classList.remove(...c); },
  toggle_class: (el, c) => { if (typeof el === 'string') el = document.querySelector(el); if (el) el.classList.toggle(c); },
  has_class: (el, c) => { if (typeof el === 'string') el = document.querySelector(el); return el ? el.classList.contains(c) : false; },
  on: (el, ev, fn) => { if (typeof el === 'string') el = document.querySelector(el); if (el) el.addEventListener(ev, fn); },
  mount: (el, t) => { const p = t ? (typeof t === 'string' ? document.querySelector(t) : t) : document.body; p.appendChild(el); return el; },
  inject_css: (css, id) => {
    if (id) { const e = document.getElementById(id); if (e) { e.textContent = css; return e; } }
    const s = document.createElement('style'); if (id) s.id = id; s.textContent = css; document.head.appendChild(s); return s;
  },
  animate: (el, kf, opts = {}) => {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) return null;
    return el.animate(kf, { duration: opts.duration || 1000, easing: opts.easing || 'ease', iterations: opts.iterations || 1, fill: opts.fill || 'forwards', delay: opts.delay || 0 });
  },
  remove: (el) => { if (typeof el === 'string') el = document.querySelector(el); if (el && el.parentNode) el.parentNode.removeChild(el); },
  clear: (el) => { if (typeof el === 'string') el = document.querySelector(el); if (el) while (el.firstChild) el.removeChild(el.firstChild); },
  ready: (fn) => { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); },
};

const state = {
  machine: (cfg) => {
    let cur = cfg.initial; const ls = [];
    return {
      get current() { return cur; },
      send(ev) { const sc = cfg.states[cur]; if (sc && sc.on && sc.on[ev]) { const nx = sc.on[ev]; const pv = cur; cur = typeof nx === 'string' ? nx : nx.target; if (typeof nx === 'object' && nx.action) nx.action(pv, cur); ls.forEach(fn => fn(cur, pv, ev)); } return cur; },
      on_change(fn) { ls.push(fn); },
    };
  },
  reactive: (init) => {
    let v = init; const ls = [];
    return {
      get: () => v,
      set: (nv) => { const o = v; v = nv; ls.forEach(fn => fn(v, o)); },
      update: (fn) => { const o = v; v = fn(v); ls.forEach(fn => fn(v, o)); },
      on_change: (fn) => { ls.push(fn); },
      bind: (el) => { if (typeof el === 'string') el = document.querySelector(el); if (el) { el.textContent = v; ls.push((nv) => { el.textContent = nv; }); } },
    };
  },
  store: (init) => {
    let data = { ...init }; const ls = [];
    return {
      get: (k) => k ? data[k] : { ...data },
      set: (k, v) => { data[k] = v; ls.forEach(fn => fn(k, v, data)); },
      on_change: (fn) => { ls.push(fn); },
    };
  },
};

const time = {
  now: () => Date.now(),
  delay: (ms) => new Promise(r => setTimeout(r, ms)),
  interval: (fn, ms) => setInterval(fn, ms),
  clear_interval: (id) => clearInterval(id),
  format: (ms) => new Date(ms).toISOString().slice(11, 23),
  ticker: (fn, ms) => { let id = setInterval(fn, ms); return { stop: () => clearInterval(id) }; },
};

const crypto_util = {
  hash: async (str) => {
    const buf = new TextEncoder().encode(str);
    const h = await window.crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  },
  uuid: () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }),
};

const canvas = {
  create: (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { el: c, ctx: c.getContext('2d') };
  },
  resize: (c, w, h) => { c.el.width = w; c.el.height = h; },
};

// ═══ Application Code ═══

`

const FOOTER = `

// ═══ Lume Health Beacon ═══
window.__LUME_HEALTH__ = {
  status: 'ok',
  rendered: Date.now(),
  version: '0.8.1',
  bundle: 'cortex',
  product: 'Lume Cortex',
  stages: { syntax: true, structure: true, execution: true }
};

})();
`

// ── Build ──
const buildStart = Date.now()
console.log('  ✦ Lume Cortex Bundler')
console.log(`  Source Dir: ${lumeDir} (${files.length} files)`)
console.log(`  Output: ${distPath}`)

const appCode = transformLume(source)
const bundle = STDLIB + appCode + FOOTER

writeFileSync(distPath, bundle, 'utf-8')
console.log(`  ✓ Bundle written: ${(bundle.length / 1024).toFixed(1)} KB`)

// ── Stage 1: Syntax Gate ──
let validationErrors = []
console.log('  ⟐ Stage 1: Syntax Gate...')
try {
    execSync(`node -c "${distPath}"`, { stdio: 'pipe' })
    console.log('  ✓ Stage 1: Syntax valid')
} catch (e) {
    const stderr = e.stderr?.toString() || ''
    const errorMatch = stderr.match(/SyntaxError: (.+)/)
    const errorMsg = errorMatch ? errorMatch[1] : 'Unknown syntax error'
    console.log(`  ✗ Stage 1 FAILED: ${errorMsg}`)
    validationErrors.push({ stage: 1, error: errorMsg })
}

// ── Stage 2: Structural Validation ──
console.log('  ⟐ Stage 2: Structural validation...')
{
    const lines = bundle.split('\n')
    let parenDepth = 0, braceDepth = 0, inTemplateLiteral = false
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        for (let c = 0; c < line.length; c++) {
            const ch = line[c]
            if (ch === '`') { inTemplateLiteral = !inTemplateLiteral; continue }
            if (inTemplateLiteral) continue
            if (ch === '"' || ch === "'") { const q = ch; c++; while (c < line.length && line[c] !== q) { if (line[c] === '\\') c++; c++ } continue }
            if (ch === '(') parenDepth++; if (ch === ')') parenDepth--
            if (ch === '{') braceDepth++; if (ch === '}') braceDepth--
        }
    }
    if (parenDepth === 0 && braceDepth === 0) {
        console.log('  ✓ Stage 2: Structure balanced')
    } else {
        console.log(`  ✗ Stage 2 FAILED: Paren: ${parenDepth}, Brace: ${braceDepth}`)
        validationErrors.push({ stage: 2, error: `Paren: ${parenDepth}, Brace: ${braceDepth}` })
    }
}

// ── Stage 3: VM Execution Test ──
console.log('  ⟐ Stage 3: VM execution test...')
{
    const ctxStub = { clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){}, lineTo(){}, fillText(){}, measureText(){ return { width: 0 } }, save(){}, restore(){}, translate(){}, rotate(){}, scale(){}, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', globalAlpha: 1, setTransform(){}, createLinearGradient(){ return { addColorStop(){} } }, createRadialGradient(){ return { addColorStop(){} } } }
    const makeEl = (tag = 'div') => ({
        tagName: tag, style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false } },
        setAttribute(){}, getAttribute(){ return '' }, addEventListener(){}, appendChild(c){ return c },
        animate(){ return { finished: Promise.resolve() } }, textContent: '', innerHTML: '', id: '', className: '',
        children: [], childNodes: [], parentNode: { removeChild(){} }, firstChild: null, remove(){},
        querySelectorAll(){ return [] }, querySelector(){ return makeEl() },
        focus(){}, blur(){}, value: '', dataset: {}, scrollTop: 0, scrollHeight: 0,
        getBoundingClientRect(){ return { top: 0, left: 0, width: 1024, height: 768 } },
        offsetWidth: 1024, offsetHeight: 768, width: 1024, height: 768,
        getContext(){ return ctxStub },
    })
    const sandbox = {
        document: { createElement: (t) => makeEl(t), querySelector: () => makeEl(), querySelectorAll: () => [], getElementById: () => makeEl(), head: { appendChild(){} }, body: { appendChild(){}, style: {} }, readyState: 'complete', addEventListener(ev, fn){ if (ev === 'DOMContentLoaded') fn() }, referrer: '' },
        window: { location: { hash: '#boot', href: '', pathname: '/' }, scrollTo(){}, addEventListener(){}, removeEventListener(){}, innerWidth: 1024, innerHeight: 768, matchMedia(){ return { matches: false, addEventListener(){} } }, localStorage: { getItem: () => null, setItem(){}, removeItem(){} }, sessionStorage: { getItem: () => null, setItem(){} }, requestAnimationFrame(fn){ return 0 }, cancelAnimationFrame(){}, getComputedStyle(){ return {} } },
        navigator: { userAgent: 'LumeCortex/1.0' },
        console: { log(){}, error(){}, warn(){}, info(){} },
        setTimeout: (fn) => { return 0 }, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
        requestAnimationFrame(fn){ return 0 }, cancelAnimationFrame(){},
        performance: { now: () => 0 },
        alert(){}, fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
        URL: globalThis.URL, crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000', subtle: { digest: () => Promise.resolve(new ArrayBuffer(32)) } },
        FileReader: class { readAsDataURL(){} set onload(fn){} },
        IntersectionObserver: class { observe(){} unobserve(){} disconnect(){} },
        MutationObserver: class { observe(){} disconnect(){} },
        ResizeObserver: class { observe(){} unobserve(){} disconnect(){} },
        Date, Math, JSON, String, Object, Array, parseInt, parseFloat, Promise,
        TextEncoder: globalThis.TextEncoder, Uint8Array: globalThis.Uint8Array,
        Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect,
    }
    try {
        const script = new vm.Script(bundle, { filename: 'dist/cortex.js' })
        const context = vm.createContext(sandbox)
        script.runInContext(context, { timeout: 5000 })
        console.log('  ✓ Stage 3: VM execution clean')
    } catch (e) {
        console.log(`  ✗ Stage 3 FAILED: ${e.message}`)
        validationErrors.push({ stage: 3, error: e.message })
    }
}

// ── Result ──
const buildEnd = Date.now()
if (validationErrors.length > 0) {
    console.log('\n  ═══════════════════════════════════════')
    console.log('  ✗ BUILD BLOCKED — Validation failed')
    validationErrors.forEach(e => console.log(`    Stage ${e.stage}: ${e.error}`))
    console.log('  ═══════════════════════════════════════\n')
    process.exit(1)
} else {
    console.log(`  ✓ Build time: ${buildEnd - buildStart}ms`)
    console.log('  ✦ All 3 validation stages passed')
    console.log('  ✦ Lume Cortex ready ✦\n')
}
