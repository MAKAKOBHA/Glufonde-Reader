/* Два декоративных d10 в свободном поле справа от книги. Без внешних библиотек. */
(function () {
  'use strict';
  var canvas = document.createElement('canvas');
  canvas.id = 'gf-dice';
  canvas.width = 280; canvas.height = 310;
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('aria-label', 'Бросить два десятигранных кубика');
  canvas.title = 'Нажмите или удерживайте и отпустите, чтобы бросить 2d10';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  var dice = [{x:85,y:145,vx:0,vy:0,angle:-.18,spin:0,value:4},
              {x:195,y:145,vx:0,vy:0,angle:.24,spin:0,value:7}];
  var moving = false, last = 0, downAt = 0, frame = 0;
  function available() {
    if (innerWidth < 1100 || !matchMedia('(pointer: fine)').matches || !location.hash.startsWith('#/read/')) return false;
    var article = document.getElementById('article');
    if (!article || !article.getBoundingClientRect().width) return false;
    var rect = article.getBoundingClientRect();
    var room = innerWidth - rect.right;
    if (room < 285) return false;
    canvas.style.left = Math.round(rect.right + Math.max(2, Math.min(14, (room-285)/2))) + 'px';
    canvas.style.top = 'max(125px, 20vh)';
    return true;
  }
  function visibility() {
    var yes = available();
    canvas.hidden = !yes;
    if (!yes && moving) { moving = false; cancelAnimationFrame(frame); }
  }
  function polygon(points,fill,stroke) {
    ctx.beginPath();points.forEach(function(p,i){if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);});
    ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.6;ctx.stroke();
  }
  function drawDie(d,index) {
    ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.angle);
    ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=14;ctx.shadowOffsetY=9;
    var top=[0,-49],left=[-49,-18],right=[49,-18],bottom=[0,50],mid=[0,5];
    polygon([top,left,mid],index?'#38342b':'#58431e','#b18a41');
    polygon([top,mid,right],index?'#504636':'#745523','#e1b85c');
    polygon([left,bottom,mid],index?'#24221f':'#332817','#a57e39');
    polygon([right,mid,bottom],index?'#353027':'#473518','#b18a41');
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.fillStyle='#f8d98c';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='bold 17px Georgia,serif';
    var v=d.value;
    ctx.fillText(String(v),0,-20);
    ctx.font='12px Georgia,serif';
    ctx.fillText(String((v+3)%10),-20,14);
    ctx.fillText(String((v+7)%10),20,14);
    ctx.restore();
  }
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='rgba(190,145,58,.2)';
    ctx.beginPath();ctx.ellipse(140,170,129,108,0,0,Math.PI*2);ctx.stroke();
    dice.forEach(drawDie);
    ctx.textAlign='center';ctx.font='12px Georgia,serif';ctx.fillStyle='#b99551';
    ctx.fillText(moving?'БРОСОК...':'НАЖМИТЕ, ЧТОБЫ БРОСИТЬ',140,290);
  }
  function tick(time) {
    var dt=Math.min(2,(time-last)/16.67||1);last=time;
    var active=false;
    dice.forEach(function(d) {
      d.x+=d.vx*dt;d.y+=d.vy*dt;d.angle+=d.spin*dt;
      if(d.x<55||d.x>225){d.x=Math.max(55,Math.min(225,d.x));d.vx*=-.75;}
      if(d.y<62||d.y>237){d.y=Math.max(62,Math.min(237,d.y));d.vy*=-.75;}
      var friction=Math.pow(.965,dt);
      d.vx*=friction;d.vy*=friction;d.spin*=Math.pow(.955,dt);
      if(Math.abs(d.vx)+Math.abs(d.vy)+Math.abs(d.spin)*30>0.45)active=true;
    });
    var a=dice[0],b=dice[1],dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy);
    if(dist<96 && dist>0.01) {
      var nx=dx/dist,ny=dy/dist,overlap=(96-dist)/2;
      a.x-=nx*overlap;b.x+=nx*overlap;a.y-=ny*overlap;b.y+=ny*overlap;
      var av=a.vx*nx+a.vy*ny,bv=b.vx*nx+b.vy*ny;
      if(av>bv){var impulse=(av-bv)*.78;a.vx-=nx*impulse;a.vy-=ny*impulse;b.vx+=nx*impulse;b.vy+=ny*impulse;}
    }
    draw();
    if(active)frame=requestAnimationFrame(tick);
    else {moving=false;dice.forEach(function(d){d.vx=d.vy=d.spin=0;d.angle=Math.round(d.angle/(Math.PI/5))*(Math.PI/5);});draw();}
  }
  function roll() {
    if(canvas.hidden)return;
    cancelAnimationFrame(frame);
    var strength=Math.min(2.1,1+(Date.now()-downAt)/1200);
    dice.forEach(function(d,i){
      d.value=Math.floor(Math.random()*10);
      d.vx=(i? -1:1)*(3+Math.random()*3)*strength;
      d.vy=(Math.random()-.5)*10*strength;
      d.spin=(Math.random()-.5)*.38*strength;
    });
    moving=true;last=0;frame=requestAnimationFrame(tick);
  }
  canvas.addEventListener('pointerdown',function(e){if(e.button!==0)return;downAt=Date.now();canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointerup',function(e){if(e.button===0)roll();});
  canvas.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();downAt=Date.now();roll();}});
  window.addEventListener('resize',visibility);
  window.addEventListener('hashchange',function(){setTimeout(visibility,60);});
  new MutationObserver(visibility).observe(document.body,{attributes:true,attributeFilter:['data-view']});
  visibility();draw();
})();
