// Wide screens: the Queue card moves to the top of the right-hand column (above Now singing and the Scoreboard) and stays there
// whether you are on the home page or on stage. On narrow screens it goes back to the home page (the sidebar is a drawer there).
(function () {
  const card = document.getElementById('queueCard'), cards = document.getElementById('sideCards'); if (!card || !cards) return;
  const mq = matchMedia('(min-width:1000px)'), ph = document.createComment('queue'); card.parentNode.insertBefore(ph, card);
  const place = () => {
    if (mq.matches) { if (card.parentNode !== cards) cards.insertBefore(card, cards.firstChild); }
    else if (card.parentNode !== ph.parentNode) ph.parentNode.insertBefore(card, ph.nextSibling);
    document.body.classList.toggle('qside', mq.matches);
  };
  (mq.addEventListener ? mq.addEventListener('change', place) : mq.addListener(place)); place();
})();
