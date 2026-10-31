#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const window={};
vm.runInNewContext(read('js/glossary-data.js'),{window});
vm.runInNewContext(read('js/lore.js'),{window});
const glossary=window.GF_GLOSSARY, lore=window.GF_LORE;
const engine=require('../js/glossary-core.js');
const matcher=engine.compile(glossary);
assert.equal(glossary.entries.length,87);
assert.equal(lore.shortChapters.length,13);
assert.equal(lore.fullChapters.length,11);
assert(lore.fullChapters.every(c=>!c.md.includes('# ГЛАВА. Словарь терминов')));
assert(lore.shortChapters.every(c=>!c.md.includes('# ГЛАВА. Словарь терминов')));
for(const entry of glossary.entries){
  assert.equal(matcher.find(entry.term)[0]?.id,entry.id,entry.term);
  assert(entry.definition.length>12,entry.term);
}
function match(s,expect){
  const result=matcher.find(s).map(x=>x.term);
  assert.deepEqual(result,expect,'В тексте: '+s);
}
match('Настава и Наставом',[ 'Настав','Настав' ]);
match('Прелатами и Прелатах',['Прелат','Прелат']);
match('Карбодорами',['Карбодор']);
match('маридора, маридоры, маридорами',['Маридор','Маридор','Маридор']);
match('Центрона, центронов',['Центрон','Центрон']);
match('Глубью и Глуби',['Глубь','Глубь']);
match('партией и партиями',['Партия','Партия']);
match('муниципального центрона',['Муниципальный центрон']);
match('муниципальными центронами',['Муниципальный центрон']);
match('Центрон. Центрон. Центрон.', ['Центрон','Центрон','Центрон']);
match('Непартиями и центронография',[]);
match('Партийного человека',[]);
const special=engine.compile({entries:[
  {id:'small',term:'Центрон',definition:'Деньги'},
  {id:'large',term:'Муниципальный центрон',definition:'Местные деньги'}
]});
assert.equal(special.find('муниципального центрона')[0]?.id,'large');
assert.equal(special.find('псевдоцентрон').length,0);
assert.equal(engine.compile(null).find('центрон').length,0);
const markdown=require('../js/markdown.js');
for (const edition of [lore.shortChapters,lore.fullChapters]) {
  const ids=new Set();
  for (const chapter of edition) {
    assert(!ids.has(chapter.id),'Повтор ID главы: '+chapter.id);
    ids.add(chapter.id);
    const result=markdown.render(chapter.md);
    assert(result.title,'Нет заголовка: '+chapter.id);
    assert.deepEqual(result.warnings,[],'Ошибка Markdown: '+chapter.id);
    assert(result.html.includes('<h1'),'Нет шапки главы: '+chapter.id);
    assert(!/Словарь терминов/i.test(result.title),'Словарь попал в оглавление');
  }
}
const all=Object.values(lore).filter(Array.isArray).flat();
assert(new Set(all.map(x=>x.md)).size>=24,'Отдельные исходные версии');
assert(all.some(x=>/Глубь/i.test(x.md)),'Нет Глуби');
assert(all.some(x=>/религия/i.test(x.md)),'Нет религии');
const app=read('js/app.js'),page=read('index.html'),ui=read('js/glossary-ui.js'),css=read('css/glossary.css');
assert(app.includes("loreMode === 'short' ? lore.shortChapters : lore.fullChapters"),'Смешаны режимы');
assert(app.includes("GFGlossaryUI.decorate(els.article)"),'Нет обычного чтения');
assert(app.includes("GFGlossaryUI.decorate(article)"),'Нет разделённого чтения');
assert(app.includes('pendingLoreFraction = targetId === previousChapter ? previousFraction : 0'),
  'Не сохранено относительное место при смене редакции');
assert(app.includes('restoreFraction(splitScroller, splitFraction)'),
  'Не сохранена относительная позиция в двухоконном режиме');
assert(app.includes("showReader(nextChapter, 'top');"),
  'Переключение редакций должно немедленно перерисовывать главу');
assert(app.includes("useBook('lore'); // Перестраивает оглавление"),
  'Не обновляется оглавление выбранной редакции');
assert(app.includes('function readingBack('),'Потеряна история чтения');
assert(app.includes('function openSplit('),'Потерян разделённый экран');
assert(!app.includes('makeShortLore('),'Автоматическое сокращение должно быть отключено');
assert(page.includes('js/glossary-core.js')&&page.includes('js/glossary-ui.js'));
assert(ui.includes('document.createTextNode'),'Небезопасная обработка текста');
assert(ui.includes("e.key==='Escape'"),'Нет закрытия по Escape');
assert(ui.includes("term.setAttribute('aria-describedby'"),'Нет доступности подсказки');
assert(ui.includes("e.pointerType==='touch'"),'Нет обработки касаний');
assert(ui.includes("lastPointer==='touch'"),'Нет сенсорной панели');
assert(css.includes('env(safe-area-inset-bottom'),'Нет учёта нижнего края iPhone');
assert(css.includes('.gf-glossary-tooltip'),'Нет подсказки мышью');
assert(css.includes('body.split-active .gf-glossary-sheet'),'Нет расположения в разделённом режиме');
console.log('✓ Глоссарий: 87 определений, склонения, составные термины, границы слов, UI; '+lore.shortChapters.length+'/'+lore.fullChapters.length+' глав.');
