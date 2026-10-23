/* Each discipline follows page scroll and repeats its rise on every visit. */
(() => {
  'use strict';
  const strip = document.querySelector('.capability-strip');
  if (!strip) return;
  const words = [...strip.querySelectorAll('.capability-word')];
  if (!words.length) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = document.body.matches('.motion-paused, .motion-reduced');
  let frame = 0, layoutTop = 0, stripHeight = 0, nearby = true, visible = false;
  const clamp = value => Math.max(0,Math.min(1,value));
  const isPaused = () => paused || reducedMotion.matches;

  function syncStars() {
    strip.classList.toggle('capabilities-running',visible && !document.hidden && !isPaused());
  }
  function paint() {
    frame = 0;
    if (document.hidden) return;
    const viewport = Math.max(1,window.innerHeight);
    const top = layoutTop-window.scrollY;
    if (!('IntersectionObserver' in window)) visible = top < viewport && top+stripHeight > 0;
    syncStars();
    const travel = Math.max(160,Math.min(400,viewport*.5));
    const overall = (viewport*.96-top)/travel;
    words.forEach((word,index) => {
      // Derive every pass from scroll position so scrolling back rearms the rise.
      const progress = isPaused() ? 1 : clamp((overall-index*.18)/.4);
      const eased = progress*progress*(3-2*progress);
      word.style.setProperty('--capability-rise',`${((1-eased)*68).toFixed(2)}px`);
      word.style.setProperty('--capability-opacity',(.16+eased*.84).toFixed(3));
    });
  }
  function queuePaint() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(paint);
  }
  function measure() {
    // Exclude the introduction's parent reveal transform from scroll progress.
    layoutTop = 0;
    for (let element = strip; element; element = element.offsetParent) layoutTop += element.offsetTop || 0;
    stripHeight = strip.offsetHeight;
    queuePaint();
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      nearby = entries[0].isIntersecting;
      if (nearby) queuePaint();
    },{rootMargin:'160px 0px'}).observe(strip);
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      syncStars();
    },{threshold:0}).observe(strip);
  }
  window.addEventListener('scroll',() => {
    if (nearby || !('IntersectionObserver' in window)) queuePaint();
  },{passive:true});
  window.addEventListener('resize',measure,{passive:true});
  document.addEventListener('kar:languagechange',measure);
  document.addEventListener('kar:motionchange',event => {
    paused = Boolean(event.detail.paused); syncStars(); queuePaint();
  });
  reducedMotion.addEventListener('change',() => { syncStars(); queuePaint(); });
  document.addEventListener('visibilitychange',() => {
    if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; }
    syncStars();
    if (!document.hidden) measure();
  });
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(strip);
  strip.classList.add('capabilities-enhanced');
  measure();
  document.fonts?.ready.then(measure);
})();
