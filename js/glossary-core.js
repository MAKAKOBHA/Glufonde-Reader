/* Глоссарий Глюфонде: проверяемые формы слов и поиск по границам токенов.
 * Без сетевых запросов и зависимостей, строится единожды для 87 статей. */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.GFGlossary=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var wordRe=/[\\p{L}\\p{M}\\p{N}]+(?:[-‑][\\p{L}\\p{M}\\p{N}]+)*/gu;
  function normalize(s){return String(s).normalize('NFC').toLocaleLowerCase('ru').replace(/ё/g,'е');}
  function tokens(s){return Array.from(String(s).matchAll(wordRe),function(m){return {text:m[0],start:m.index,end:m.index+m[0].length,key:normalize(m[0])};});}
  function variants(word){
    var w=normalize(word), out=new Set([w]);
    function add(stem,endings){endings.forEach(function(e){out.add(stem+e);});}
    // Прилагательные согласуются с определяемым существительным.
    if(/(ый|ий|ой)$/.test(w)){
      var stem=w.slice(0,-2),soft=w.endsWith('ий');
      add(stem,soft?['его','ему','им','ем','ие','их','ими','яя','ей','юю','ее']:
        ['ого','ому','ым','ом','ые','ых','ыми','ая','ой','ую','ое']);
    } else if(/ая$/.test(w)){
      add(w.slice(0,-2),['ая','ой','ую','ые','ых','ыми','ою']);
    } else if(/ое$/.test(w)){
      add(w.slice(0,-2),['ое','ого','ому','ым','ом','ые','ых','ыми']);
    } else if(/ия$/.test(w)){
      add(w.slice(0,-2),['ия','ии','ию','ией','иею','ий','иям','иями','иях']);
    } else if(/ья$/.test(w)){
      add(w.slice(0,-2),['ья','ьи','ью','ьей','ьёй','ьям','ьями','ьях','ей']);
    } else if(/а$/.test(w)){
      add(w.slice(0,-1),['а','ы','е','у','ой','ою','ам','ами','ах']);
    } else if(/я$/.test(w)){
      add(w.slice(0,-1),['я','и','е','ю','ей','ею','ям','ями','ях']);
    } else if(/ь$/.test(w)){
      add(w.slice(0,-1),['ь','и','ью','ей','ям','ями','ях']);
    } else if(/[бвгджзклмнпрстфхцчшщ]$/.test(w) && w.length>=4){
      add(w,['а','у','ом','е','ы','ов','ам','ами','ах']);
    } else if(/о$/.test(w)){
      add(w.slice(0,-1),['о','а','у','ом','е','а','ам','ами','ах']);
    } else if(/е$/.test(w)){
      add(w.slice(0,-1),['е','я','ю','ем','и','й','ям','ями','ях']);
    }
    return Array.from(out);
  }
  function compile(source){
    var entries=Array.isArray(source)?source:(source&&source.entries)||[];
    var rootNode={children:new Map(),entry:null}, indexed=0;
    entries.forEach(function(entry){
      if(!entry||!entry.term||!entry.definition)return;
      var expressions=[entry.term].concat(entry.aliases||[],entry.forms||[]);
      var seen=new Set();
      function install(words){
        var phrase=words.map(normalize).join(' ');
        if(!phrase||seen.has(phrase))return;
        seen.add(phrase);var node=rootNode;
        words.forEach(function(word){
          var key=normalize(word);
          if(!node.children.has(key))node.children.set(key,{children:new Map(),entry:null});
          node=node.children.get(key);
        });
        // Для совпадающих слов оставляем более конкретную явно заданную статью.
        if(!node.entry)node.entry=entry;
        indexed++;
      }
      expressions.forEach(function(expr){
        var parts=tokens(expr).map(function(w){return w.text;});
        if(parts.length)install(parts);
      });
      // Генерируем формы токенов, а не подстроки: составные термины могут склоняться.
      var base=tokens(entry.term).map(function(w){return w.text;});
      if(!base.length)return;
      if(base.length===1){
        variants(base[0]).forEach(function(w){install([w]);});
      }else if(base.length<=4){
        var candidate=base.map(variants);
        function combinations(i,acc){
          if(i===candidate.length){install(acc);return;}
          candidate[i].forEach(function(v){combinations(i+1,acc.concat(v));});
        }
        // Ограничиваем потенциальный рост сочетаний; для больших фраз используем
        // явные формы и неизменяемый канон.
        var cost=candidate.reduce(function(x,y){return x*y.length;},1);
        if(cost<=900)combinations(0,[]);
      }
    });
    function find(text){
      var ts=tokens(text),hits=[];
      for(var i=0;i<ts.length;){
        var node=rootNode,best=null;
        for(var j=i;j<ts.length;j++){
          if(j>i && /[^\\s]/u.test(text.slice(ts[j-1].end,ts[j].start)))break;
          node=node.children.get(ts[j].key);
          if(!node)break;
          if(node.entry)best={start:ts[i].start,end:ts[j].end,id:node.entry.id,term:node.entry.term,
            definition:node.entry.definition,category:node.entry.category};
        }
        if(best){hits.push(best);while(i<ts.length&&ts[i].start<best.end)i++;}
        else i++;
      }
      return hits;
    }
    return {find:find,entries:entries,indexedForms:indexed};
  }
  return {compile:compile,tokens:tokens,variants:variants,normalize:normalize};
});
