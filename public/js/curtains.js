/* opening curtains: play once when the site is first opened, then delete them so the Home button never replays them */
(function(){var c=document.querySelector('.curtain-open');if(!c)return;
if(!document.body.classList.contains('home')||matchMedia('(prefers-reduced-motion:reduce)').matches){c.remove();return}
c.classList.add('play');var kill=function(){c.remove()};
c.addEventListener('animationend',function(e){if(e.target===c)kill()});setTimeout(kill,4500)})();
