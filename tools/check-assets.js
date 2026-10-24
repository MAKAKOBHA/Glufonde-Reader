#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const exists = p => fs.existsSync(path.join(root, p));
const errors = [];
function check(ref, origin) {
  if (!ref || /^(?:https?:|data:|#|mailto:|javascript:)/i.test(ref)) return;
  const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
  if (!clean || clean.includes('${')) return;
  const file = clean.startsWith('/') ? clean.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(origin), clean));
  if (file.startsWith('../') || path.posix.isAbsolute(file) || !exists(file))
    errors.push(origin + ': ресурс не найден: ' + ref);
}
function read(p) { return fs.readFileSync(path.join(root,p),'utf8'); }
const html = read('index.html');
for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) check(m[1], 'index.html');
for (const css of ['css/style.css','css/reader-enhancements.css','assets/fonts/fonts.css']) {
  const source = read(css);
  for (const m of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) check(m[1].trim(), css);
}
for (const m of read('js/config.js').matchAll(/ambience:\s*['"]([^'"]+)['"]/g)) check('/' + m[1], 'index.html');
const loreSource = read('js/lore.js').replace(/^\s*\/\*[\s\S]*?\*\//, '');
for (const m of loreSource.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) check('/' + m[1], 'index.html');
const manifest = JSON.parse(read('content/manifest.json'));
for (const ch of manifest.chapters) {
  if (!ch.file || !exists('content/' + ch.file)) continue;
  const md = read('content/' + ch.file);
  for (const m of md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) check('/' + m[1], 'index.html');
}
if (errors.length) { errors.forEach(e => console.error('✗ ' + e)); process.exit(1); }
console.log('✓ Все проверенные локальные ресурсы существуют.');
