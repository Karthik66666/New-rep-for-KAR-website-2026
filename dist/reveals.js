/* Existing headings and story sections rise again on every downward visit. */
(() => {
  'use strict';
  const elements = [...document.querySelectorAll('.reveal')];
  if (!elements.length) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = document.body.matches('.motion-paused, .motion-reduced');
  let frame = 0, layout = [];
  const clamp = value => Math.max(0,Math.min(1,value));

  function paint() {
    frame = 0;
    if (document.hidden) return;
    const viewport = Math.max(1,window.innerHeight);
    const travel = Math.max(160,Math.min(320,viewport*.45));
    const stationary = paused || reducedMotion.matches;
    layout.forEach(item => {
      const top = item.top-window.scrollY;
      const raw = (viewport*.96-top)/travel;
      const focused = item.element.contains(document.activeElement);
      const progress = stationary || focused ? 1 : clamp((raw-item.phase)/(1-item.phase));
      const eased = progress*progress*(3-2*progress);
      const value = [((1-eased)*item.rise).toFixed(2),(.16+eased*.84).toFixed(3),(1-(1-eased)*item.scale).toFixed(4)];
      if (value.join() === item.previous) return;
      item.previous = value.join();
      item.element.style.setProperty('--reveal-rise',`${value[0]}px`);
      item.element.style.setProperty('--reveal-opacity',value[1]);
      item.element.style.setProperty('--reveal-scale',value[2]);
    });
    // A failed module leaves the original content visible instead of hidden.
    document.body.classList.add('scroll-reveals');
  }
  function queuePaint() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(paint);
  }
  function measure() {
    let introIndex = 0;
    layout = elements.map(element => {
      let top = 0;
      // Parent/child reveal transforms never affect the cached document position.
      for (let parent = element; parent; parent = parent.offsetParent) top += parent.offsetTop || 0;
      const introduction = element.id === 'intro';
      const introChild = !introduction && element.closest('#intro');
      return {element,top,rise:introduction ? 64 : introChild ? 30 : 32,
        scale:introduction ? .02 : 0,phase:introChild ? Math.min(introIndex++*.08,.2) : 0,previous:''};
    });
    queuePaint();
  }
  window.addEventListener('scroll',queuePaint,{passive:true});
  window.addEventListener('resize',measure,{passive:true});
  document.addEventListener('kar:languagechange',measure);
  document.addEventListener('focusin',queuePaint);
  document.addEventListener('focusout',queuePaint);
  document.addEventListener('load',measure,true);
  document.addEventListener('kar:motionchange',event => { paused = Boolean(event.detail.paused); queuePaint(); });
  reducedMotion.addEventListener('change',queuePaint);
  document.addEventListener('visibilitychange',() => {
    if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; }
    if (!document.hidden) measure();
  });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(measure);
    // Stacks, translations and CMS updates can change a section's height above us.
    const observed = new Set([document.body,...elements,...elements.map(element => element.closest('section'))]);
    observed.forEach(element => { if (element) observer.observe(element); });
  }
  measure();
  document.fonts?.ready.then(measure);
})();
