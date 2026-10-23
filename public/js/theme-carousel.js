/* theme-carousel.js: 3D coverflow for the theme picker. Keeps the original buttons and their click handlers. */
(function(){
  var box=document.querySelector('#lTheme .thgrid'); if(!box)return;
  var items=[].slice.call(box.querySelectorAll('.thbtn')),n=items.length; if(!n)return;
  var f=Math.max(0,items.findIndex(function(b){return b.classList.contains('on')}));
  box.classList.add('thcar'); box.tabIndex=0; box.setAttribute('aria-label','Theme carousel. Use the left and right arrow keys.');
  function layout(){
    items.forEach(function(b,i){
      var o=((i-f+n+n/2)%n)-n/2; if(o<-n/2+.001)o+=n;
      var a=Math.abs(o);
      b.style.setProperty('--o',o); b.style.setProperty('--a',Math.min(a,3)); b.style.setProperty('--sg',o===0?0:o<0?-1:1);
      b.classList.toggle('ctr',o===0); b.classList.toggle('far',a>2); b.tabIndex=a>2?-1:0;
    });
  }
  function go(d){items[(f+d+n)%n].click()}   // clicking the neighbour applies its theme too, so arrows/keys/swipes behave like a panel click
  function mk(c,t,l,d){var x=document.createElement('button');x.type='button';x.className='ghost thnav '+c;x.textContent=t;x.setAttribute('aria-label',l);x.onclick=function(){go(d)};box.appendChild(x)}
  mk('prev','‹','Previous theme',-1); mk('next','›','Next theme',1);
  items.forEach(function(b,i){b.addEventListener('click',function(){f=i;layout()})});   // original click still applies the theme
  box.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'){go(-1);e.preventDefault()}else if(e.key==='ArrowRight'){go(1);e.preventDefault()}});
  var x0=null,swiped=false;
  box.addEventListener('pointerdown',function(e){x0=e.clientX;swiped=false});
  box.addEventListener('pointerup',function(e){if(x0===null)return;var dx=e.clientX-x0;x0=null;if(Math.abs(dx)>45){go(dx<0?1:-1);swiped=true}});
  box.addEventListener('click',function(e){if(swiped){e.stopPropagation();e.preventDefault();swiped=false}},true);
  new MutationObserver(function(){var k=items.findIndex(function(b){return b.classList.contains('on')});if(k>=0&&k!==f){f=k;layout()}}).observe(box,{subtree:true,attributes:true,attributeFilter:['class']});
  layout();
})();
