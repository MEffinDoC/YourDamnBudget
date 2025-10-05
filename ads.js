// Minimal ad renderer: shows house banner; swap to AdSense later.
(function(){
  const top = document.getElementById('ad-top');
  const bottom = document.getElementById('ad-bottom');
  function house(el, where){
    if(!el) return;
    el.innerHTML = `<div class="house">Thanks for using Your Damn Budget — ${where} banner</div>`;
  }
  // If you add AdSense later, load script & ins here; until then, house banners:
  house(top,'top'); house(bottom,'bottom');
})();