/* Интерактивный невидимый справочник: доступные кнопки в тексте и единая
 * подсказка для мыши/клавиатуры или нижняя панель для касаний. */
(function(root){
  'use strict';
  var core=root.GFGlossary;
  var index=core&&core.compile(root.GF_GLOSSARY||{entries:[]});
  var tooltip=null,sheet=null,openTerm=null,lastPointer='mouse',hideTimer=null;
  var reduced=root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!index)return;
  function mk(tag,className){var e=document.createElement(tag);if(className)e.className=className;return e;}
  function init(){
    if(tooltip)return;
    tooltip=mk('aside','gf-glossary-tooltip');tooltip.hidden=true;tooltip.id='gf-glossary-tooltip';
    tooltip.setAttribute('role','tooltip');
    var title=mk('strong','gf-glossary-title'),definition=mk('div','gf-glossary-definition');
    tooltip.appendChild(title);tooltip.appendChild(definition);document.body.appendChild(tooltip);
    sheet=mk('section','gf-glossary-sheet');sheet.hidden=true;sheet.setAttribute('role','dialog');
    sheet.setAttribute('aria-label','Определение термина');sheet.setAttribute('aria-modal','false');
    var head=mk('div','gf-glossary-sheet-head'),sheetTitle=mk('strong','gf-glossary-sheet-title');
    var close=mk('button','gf-glossary-close');close.type='button';close.textContent='Закрыть';
    close.setAttribute('aria-label','Закрыть определение');
    close.addEventListener('click',function(){dismiss(true);});
    head.appendChild(sheetTitle);head.appendChild(close);
    sheet.appendChild(head);sheet.appendChild(mk('div','gf-glossary-sheet-definition'));
    document.body.appendChild(sheet);
    tooltip.addEventListener('pointerenter',function(){clearTimeout(hideTimer);});
    tooltip.addEventListener('pointerleave',function(e){if(lastPointer==='mouse')scheduleDismiss(e.relatedTarget);});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')dismiss(true);});
    document.addEventListener('pointerdown',function(e){
      if(!sheet.hidden && !sheet.contains(e.target) && !e.target.closest('.gf-glossary-term'))dismiss(false);
    });
    document.addEventListener('pointerover',function(e){
      var term=e.target.closest&&e.target.closest('.gf-glossary-term');
      if(!term||e.pointerType==='touch')return;
      lastPointer=e.pointerType||'mouse';
      clearTimeout(hideTimer);showTip(term);
    });
    document.addEventListener('pointerout',function(e){
      var term=e.target.closest&&e.target.closest('.gf-glossary-term');
      if(!term||e.pointerType==='touch')return;
      if(e.relatedTarget&&(term.contains(e.relatedTarget)||tooltip.contains(e.relatedTarget)))return;
      scheduleDismiss(e.relatedTarget);
    });
    document.addEventListener('focusin',function(e){
      var term=e.target.closest&&e.target.closest('.gf-glossary-term');
      if(term){clearTimeout(hideTimer);showTip(term);}
    });
    document.addEventListener('focusout',function(e){
      var term=e.target.closest&&e.target.closest('.gf-glossary-term');
      if(term&&!tooltip.contains(e.relatedTarget))scheduleDismiss(e.relatedTarget);
    });
    document.addEventListener('click',function(e){
      var term=e.target.closest&&e.target.closest('.gf-glossary-term');
      if(!term)return;
      e.preventDefault();e.stopPropagation();
      var isTouch=lastPointer==='touch'||(root.matchMedia&&root.matchMedia('(hover: none)').matches);
      if(isTouch)showSheet(term);else showTip(term);
    });
    document.addEventListener('pointerdown',function(e){
      if(e.target.closest&&e.target.closest('.gf-glossary-term'))lastPointer=e.pointerType||'mouse';
    },true);
    root.addEventListener('resize',function(){if(tooltip&&!tooltip.hidden&&openTerm)place(tooltip,openTerm);});
    document.addEventListener('scroll',function(){if(tooltip&&!tooltip.hidden)dismiss(false);},true);
  }
  function entryFor(term){var id=term.dataset.glossaryId;return index.entries.find(function(e){return e.id===id;});}
  function populate(e,target){target.querySelector('.gf-glossary-title, .gf-glossary-sheet-title').textContent=e.term;
    target.querySelector('.gf-glossary-definition, .gf-glossary-sheet-definition').textContent=e.definition;}
  function place(box,term){
    box.style.left='0px';box.style.top='0px';
    var tr=term.getBoundingClientRect(), w=box.offsetWidth,h=box.offsetHeight;
    var pane=term.closest('.split-pane__scroll');
    var bounds=pane?pane.getBoundingClientRect():{left:0,right:root.innerWidth,top:0,bottom:root.innerHeight};
    var left=Math.max(bounds.left+8,Math.min(tr.left+(tr.width-w)/2,bounds.right-w-8));
    var above=tr.top-h-10, top=above>=bounds.top+8?above:Math.min(tr.bottom+10,bounds.bottom-h-8);
    box.style.left=Math.round(left)+'px';box.style.top=Math.round(Math.max(bounds.top+8,top))+'px';
  }
  function showTip(term){
    var e=entryFor(term);if(!e)return;
    if(sheet&&!sheet.hidden)return;
    tooltip.hidden=false;populate(e,tooltip);openTerm=term;place(tooltip,term);
    term.setAttribute('aria-describedby','gf-glossary-tooltip');
  }
  function showSheet(term){
    var e=entryFor(term);if(!e)return;
    tooltip.hidden=true;sheet.hidden=false;populate(e,sheet);openTerm=term;
  }
  function dismiss(restore){
    clearTimeout(hideTimer);
    if(openTerm)openTerm.removeAttribute('aria-describedby');
    if(tooltip)tooltip.hidden=true;
    if(sheet)sheet.hidden=true;
    if(restore&&openTerm&&openTerm.isConnected)openTerm.focus({preventScroll:true});
    openTerm=null;
  }
  function scheduleDismiss(other){
    clearTimeout(hideTimer);
    if(other&&(tooltip.contains(other)||(other.closest&&other.closest('.gf-glossary-term'))))return;
    hideTimer=setTimeout(function(){if(sheet.hidden)dismiss(false);},110);
  }
  function decorate(rootNode){
    if(!rootNode||!index.entries.length)return 0;
    init();
    var walker=document.createTreeWalker(rootNode,NodeFilter.SHOW_TEXT),texts=[],node;
    while((node=walker.nextNode())){
      if(!node.nodeValue||!node.nodeValue.trim())continue;
      var parent=node.parentElement;
      if(!parent||parent.closest('a,button,input,textarea,select,script,style,pre,code,svg,[contenteditable],.gf-glossary-tooltip,.gf-glossary-sheet,.gf-glossary-term'))continue;
      texts.push(node);
    }
    var number=0;
    texts.forEach(function(textNode){
      var text=textNode.nodeValue,hits=index.find(text);
      if(!hits.length)return;
      var frag=document.createDocumentFragment(),cursor=0;
      hits.forEach(function(hit){
        if(hit.start>cursor)frag.appendChild(document.createTextNode(text.slice(cursor,hit.start)));
        var button=mk('button','gf-glossary-term');button.type='button';
        button.dataset.glossaryId=hit.id;button.textContent=text.slice(hit.start,hit.end);
        button.setAttribute('aria-label',button.textContent+': показать определение');
        frag.appendChild(button);cursor=hit.end;number++;
      });
      if(cursor<text.length)frag.appendChild(document.createTextNode(text.slice(cursor)));
      textNode.parentNode.replaceChild(frag,textNode);
    });
    return number;
  }
  root.GFGlossaryUI={decorate:decorate,dismiss:dismiss,index:index};
})(window);
