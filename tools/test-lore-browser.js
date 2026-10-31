#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent((req.url||'/').split('?')[0]);
  const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream',
      'Cache-Control':'no-store'});res.end(data);
  });
});
const listen=()=>new Promise(ok=>server.listen(0,'127.0.0.1',ok));
(async()=>{
  await listen();
  const url='http://127.0.0.1:'+server.address().port+'/';
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'#/read/lore-календарь-и-летоисчисление',{waitUntil:'load'});
    await page.waitForSelector('#article h1');
    const before=await page.locator('#article').innerText();
    const mainChapter=await page.locator('#article h1').innerText();
    console.log('DEBUG initial chapter:',JSON.stringify(mainChapter),'URL:',page.url(),
      'first 150:',JSON.stringify(before.slice(0,150)),'page errors:',errors);
    assert(/календарь и летоисчисление/i.test(mainChapter));
    assert.equal(await page.locator('#lore-switch').isVisible(),true);
    await page.locator('#lore-switch').click();
    await page.waitForTimeout(150);
    const after=await page.locator('#article').innerText();
    assert.notEqual(before,after,'Переключение не заменило текст');
    assert.equal(await page.locator('#lore-switch').getAttribute('aria-checked'),'true');
    assert(/календарь и летоисчисление/i.test(await page.locator('#article h1').innerText()));
    assert(page.url().includes('lore-календарь-и-летоисчисление'),'Потеряна глава');
    await page.locator('#lore-switch').click();
    assert.equal(await page.locator('#article').innerText(),before,'Полная редакция не восстановлена');
    await page.goto(url+'#/read/lore-история-уморы');
    await page.waitForSelector('#article h1');
    const fraction=await page.evaluate(()=>{
      const e=document.querySelector('#main');
      const inner=getComputedStyle(e).overflowY==='auto';
      if(inner){e.scrollTop=(e.scrollHeight-e.clientHeight)*.38;
        return e.scrollTop/Math.max(1,e.scrollHeight-e.clientHeight);}
      window.scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*.38);
      return scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight);
    });
    await page.locator('#lore-switch').click();
    const changedFraction=await page.evaluate(()=>{
      const e=document.querySelector('#main');
      if(getComputedStyle(e).overflowY==='auto')
        return e.scrollTop/Math.max(1,e.scrollHeight-e.clientHeight);
      return scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight);
    });
    assert(Math.abs(changedFraction-fraction)<.14,
      'Не сохранено относительное положение при сокращении: '+fraction+' -> '+changedFraction);
    assert(/история уморы/i.test(await page.locator('#article h1').innerText()));
    // Две книги показываются одновременно; замена лора не меняет текст RuleBook.
    await page.locator('#btn-split').click();
    assert(await page.locator('#split-reader').isVisible(),'Не открылся двухоконный режим');
    const rulesBefore=await page.locator('#split-rules-article').innerText();
    const splitBefore=await page.locator('#split-lore-article').innerText();
    await page.locator('#lore-switch').click();
    assert.notEqual(await page.locator('#split-lore-article').innerText(),splitBefore,
      'В двухоконном режиме текст лора не меняется');
    assert.equal(await page.locator('#split-rules-article').innerText(),rulesBefore,
      'Переключение лора изменило RuleBook');
    assert.deepEqual(errors,[], 'Ошибка JavaScript в браузере');
    console.log('✓ Chrome: переключение редакций, сохранение главы и места, разделённое чтение.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
