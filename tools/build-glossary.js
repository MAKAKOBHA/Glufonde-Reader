#!/usr/bin/env node
'use strict';
// Единственный редактируемый источник терминов: content/lore/glossary.json.
// Генерируем браузерный JS для работы с локальным index.html без fetch().
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=path.join(root,'content/lore/glossary.json');
const output=path.join(root,'js/glossary-data.js');
const entries=JSON.parse(fs.readFileSync(source,'utf8'));
if(!Array.isArray(entries.entries))throw new Error('Отсутствует массив entries в glossary.json');
const ids=new Set();
for(const e of entries.entries){
  if(!e||typeof e.id!=='string'||typeof e.term!=='string'||typeof e.definition!=='string'||!e.category)
    throw new Error('Неполная статья глоссария: '+JSON.stringify(e));
  if(ids.has(e.id))throw new Error('Повторяется ID глоссария: '+e.id);
  ids.add(e.id);
}
const js='/* Создано из content/lore/glossary.json. Не изменять вручную. */\n'+
  'window.GF_GLOSSARY = '+JSON.stringify(entries)+';\n';
if(process.argv.includes('--check')){
  if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==js)
    throw new Error('js/glossary-data.js не синхронизирован с glossary.json');
  console.log('✓ Глоссарий синхронизирован: '+ids.size+' статей');
}else{
  fs.writeFileSync(output+'.tmp',js,'utf8');
  fs.renameSync(output+'.tmp',output);
  console.log('✓ Собран глоссарий: '+ids.size+' статей');
}
