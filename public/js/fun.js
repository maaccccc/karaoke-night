/* fun.js: 3D tilt + light-follow on home-page cards. Pure decoration; safe to delete. */
(function(){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches||!matchMedia('(hover:hover)').matches)return;
  var MAX=7;
  document.addEventListener('pointermove',function(e){
    var c=e.target.closest&&e.target.closest('#landing .card');
    if(!c||!document.body.classList.contains('home'))return;
    if(e.target.closest('input,textarea,select'))return;
    var r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
    c.style.setProperty('--ry',((x-.5)*MAX*2).toFixed(2)+'deg');
    c.style.setProperty('--rx',((.5-y)*MAX*2).toFixed(2)+'deg');
    c.style.setProperty('--mx',(x*100).toFixed(1)+'%');
    c.style.setProperty('--my',(y*100).toFixed(1)+'%');
  },{passive:true});
  document.addEventListener('pointerout',function(e){
    var c=e.target.closest&&e.target.closest('#landing .card');
    if(c&&!c.contains(e.relatedTarget)){c.style.setProperty('--rx','0deg');c.style.setProperty('--ry','0deg')}
  });
})();
