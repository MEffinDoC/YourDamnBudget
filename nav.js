(function(){
  function setUnifiedTabWidth(){
    const tabs = Array.from(document.querySelectorAll('.tabs .tab'));
    if(!tabs.length) return;

    // Temporarily let them auto-size to measure natural width
    const saved = tabs.map(t=>({t, mw:t.style.minWidth, w:t.style.width, f:t.style.flex}));
    tabs.forEach(t=>{
      t.style.minWidth='auto';
      t.style.width='auto';
      t.style.flex='0 0 auto';
    });

    // Measure widest content (including wrap safety)
    let max = 0;
    tabs.forEach(t=>{
      // measure the first line container (button itself) plus padding safety
      const w = Math.ceil(t.scrollWidth + 12);
      if(w>max) max = w;
    });

    // Bound it so tabs never get silly
    const MIN = 84, MAX = 220;
    const target = Math.max(MIN, Math.min(MAX, max));

    // Apply for CSS to use
    document.documentElement.style.setProperty('--tabw', target + 'px');

    // Restore inline styles
    saved.forEach(s=>{ s.t.style.minWidth=s.mw; s.t.style.width=s.w; s.t.style.flex=s.f; });
  }

  // Run on load and when the viewport changes (rotation)
  window.addEventListener('DOMContentLoaded', setUnifiedTabWidth, {once:true});
  window.addEventListener('load', setUnifiedTabWidth);
  window.addEventListener('resize', setUnifiedTabWidth);

  // Also re-measure after a small delay in case fonts load late
  setTimeout(setUnifiedTabWidth, 300);
})();