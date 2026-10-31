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
    // На десктопе три стадии становятся заголовками колонок.
    // Названия Мыслей больше не дублируются внутри таблиц.
    const stageHeads = [...parsed.html.matchAll(/<table class="table table--eidos-stages"><thead><tr[^>]*>(.*?)<\/tr><\/thead>/g)];
    assert.equal(stageHeads.length, 27, 'Нет 27 таблиц со стадиями в шапке');
    stageHeads.forEach(function (match) {
      assert(match[1].includes('Сомнение') && match[1].includes('Изучение') &&
        match[1].includes('Осознание'), 'В шапке отсутствуют стадии Эйдоса');
      assert.equal((match[1].match(/<th scope="col">/g) || []).length, 3);
    });
    assert(!parsed.html.includes('<th scope="col">Мирожительство</th>'),
      'Название Эйдоса повторяется в таблице');
  }
}
const css = read('css/style.css');
assert(css.includes('.eidos-mobile__description { text-align: left; }'));
assert(css.includes('.table--eidos-interactions tbody td:nth-child(5)'));
// Планшет Safari использует широкую компоновку: маска должна быть
// глобальной, а не внутри @media (max-width: 899px).
const topbarStyles = css.slice(css.indexOf('/* ---------- Читалка: каркас ---------- */'),
  css.indexOf('@media (max-width: 899px)'));
assert(topbarStyles.includes('.topbar::before {'), 'Верхняя заглушка недоступна на широких экранах iPad');
assert(topbarStyles.includes('height: 100dvh;'), 'Высота заглушки не адаптируется к окну браузера');
assert.equal(css.split('.topbar::before {').length - 1, 1,
  'Заглушка верхней панели определена несколько раз');

// Регрессия iOS Safari: внутренняя прокрутка вместо корневой.
assert(css.includes('@supports (-webkit-touch-callout: none)'), 'Отсутствует режим iOS WebKit');
assert(css.includes('html:has(body[data-view="reader"])'), 'Корневой документ не блокируется в режиме чтения');
assert(css.includes('body[data-view="reader"] .content'), 'Нет отдельной области прокрутки статьи');
assert(css.includes('overflow-y: auto;'), 'Область чтения не прокручивается');
assert(css.includes('overscroll-behavior: none;'), 'Не ограничен выход прокрутки за края');
const app = read('js/app.js');
assert(app.includes('function hasReaderScroller()'), 'Пропал выбор контейнера прокрутки');
assert(app.includes('readerScrollTo(y,'), 'Переход к заголовкам не учитывает внутреннюю прокрутку');
assert(app.includes("els.main.addEventListener('scroll', onScroll"), 'Не отслеживается прокрутка статьи');
assert(app.includes('Math.round(readerScrollY())'), 'Не сохраняется позиция чтения внутри статьи');

assert(app.includes('gmMode || !c.master'), 'Пропала фильтрация мастерских глав');
assert(app.includes("STORE.set('gm-mode', gmMode)"), 'Пропало сохранение режима Мастера');

// Новые функции читалки и ограничения для независимых панелей.
const page = read('index.html');
for (const id of ['btn-reading-back', 'lore-switch', 'btn-split', 'split-reader',
  'split-rules-toc', 'split-rules-scroll', 'split-lore-toc', 'split-lore-scroll']) {
  assert(page.includes('id="' + id + '"'), 'Нет элемента ' + id);
}
for (const name of ['function readingBack(',
  'function captureReadingPosition(', 'function readerScrollY(',
  'function openSplit(', 'function closeSplit(', 'function navigateSplit(',
  'function renderSplitPane(']) {
  assert(app.includes(name), 'Нет функции ' + name);
}
assert(app.includes("STORE.set('lore-mode', loreMode)"), 'Режим лора не сохраняется');
assert(app.includes("STORE.set('split-positions', splitPositions)"), 'Позиции двух книг не сохраняются');
assert(app.includes('returnPosition = frame;'), 'Возврат не запоминает точное место');
assert(app.includes("['rules', 'lore'].forEach(renderSplitPane)"), 'Нет двух независимых панелей');
assert(css.includes('.split-pane__scroll {'), 'Нет независимой прокрутки панелей');
assert(css.includes('.lore-switch__thumb {'), 'Нет визуального тумблера лора');
assert(css.includes('body.split-active .reader__body > .sidebar'), 'Основное оглавление не скрывается при разделении');
console.log('✓ Аудит завершён: ' + seen.size + ' глав, ' + stageTables +
  ' таблиц Эйдоса, ' + interactionTables + ' таблицы взаимодействий.');
