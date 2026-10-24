#!/usr/bin/env node
/*
 * Сборка книги: читает content/manifest.json и все главы (.md),
 * проверяет их и записывает js/book-data.js.
 *
 * Зачем это нужно: так читалка открывается просто двойным щелчком по index.html
 * (без сервера) и одинаково работает на GitHub Pages.
 *
 * Запуск:  node tools/build.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const md = require('../js/markdown.js');

const root = path.join(__dirname, '..');
const contentDir = path.join(root, 'content');
const manifest = JSON.parse(fs.readFileSync(path.join(contentDir, 'manifest.json'), 'utf8'));

let problems = 0;
const seen = new Set();
const chapters = manifest.chapters.map((c) => {
  if (!c.id || !c.file) { console.error('✗ В manifest.json у главы нет id или file:', JSON.stringify(c)); problems++; return null; }
  if (seen.has(c.id)) { console.error('✗ Повторяется id главы:', c.id); problems++; }
  seen.add(c.id);
  const file = path.join(contentDir, c.file);
  if (!fs.existsSync(file)) { console.error('✗ Нет файла главы:', c.file); problems++; return null; }
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const r = md.render(text);
  if (!r.title) { console.error('✗ В файле', c.file, 'нет заголовка первого уровня (# Название)'); problems++; }
  r.warnings.forEach((w) => { console.warn('⚠', c.file + ':', w); problems++; });
  console.log('✓ ' + c.file.padEnd(24) + ' ' + (r.title || '(без названия)') + '  [' + r.headings.length + ' заголовков, ' + r.blocks.length + ' блоков]');
  return { id: c.id, file: c.file, md: text };
}).filter(Boolean);

const data = { built: new Date().toISOString(), chapters };
const out = '/* Файл создаётся автоматически командой «node tools/build.js». Не редактируйте вручную. */\n' +
  'window.GF_BOOK = ' + JSON.stringify(data) + ';\n';
fs.writeFileSync(path.join(root, 'js', 'book-data.js'), out, 'utf8');
console.log('\nГотово: js/book-data.js (' + Math.round(out.length / 1024) + ' КБ), глав: ' + chapters.length + (problems ? ', замечаний: ' + problems : ''));
process.exit(problems ? 1 : 0);
