#!/usr/bin/env node
'use strict';
// Регрессионный аудит каталога, оглавления и основных Markdown-структур.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const md = require('../js/markdown.js');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('content/manifest.json'));
const seen = new Set();
let stageTables = 0;
let interactionTables = 0;
for (const ch of manifest.chapters) {
  assert(!seen.has(ch.id), 'Повторяется ID главы ' + ch.id);
  seen.add(ch.id);
  const parsed = md.render(read('content/' + ch.file));
  assert.equal(parsed.warnings.length, 0, ch.file + ': ' + parsed.warnings.join('; '));
  assert(parsed.title, 'Отсутствует название главы: ' + ch.file);
  const headingIds = parsed.headings.map(h => h.id);
  assert.equal(new Set(headingIds).size, headingIds.length, ch.file + ': повторяются якоря заголовков');
  if (ch.id === 'gm-eidos-catalog') {
    stageTables = (parsed.html.match(/table--eidos-stages/g) || []).length;
    interactionTables = (parsed.html.match(/table--eidos-interactions/g) || []).length;
    assert.equal(stageTables, 27, 'Ожидалось 27 таблиц стадий Эйдоса');
    assert.equal(interactionTables, 2, 'Ожидались таблицы Резонансов и Диссонансов/Парадоксов');
    assert.equal((parsed.html.match(/class="eidos-mobile__stage-name"/g) || []).length, 81);
    assert.equal((parsed.html.match(/class="eidos-mobile__effect"/g) || []).length, 81);
    assert(!parsed.html.includes('eidos-mobile__title'), 'Повторение названия Эйдоса в мобильной карточке');
  }
}
const css = read('css/style.css');
assert(css.includes('.eidos-mobile__description { text-align: left; }'));
assert(css.includes('.table--eidos-interactions tbody td:nth-child(5)'));
const app = read('js/app.js');
assert(app.includes('gmMode || !c.master'), 'Пропала фильтрация мастерских глав');
assert(app.includes("STORE.set('gm-mode', gmMode)"), 'Пропало сохранение режима Мастера');
console.log('✓ Аудит завершён: ' + seen.size + ' глав, ' + stageTables +
  ' таблиц Эйдоса, ' + interactionTables + ' таблицы взаимодействий.');
