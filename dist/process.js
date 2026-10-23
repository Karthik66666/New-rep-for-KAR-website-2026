/* Card positions follow scroll distance directly; icon loops run only in view. */
(() => {
  'use strict';
  const grid = document.querySelector('.process-grid');
  if (!grid) return;
  const cards = [...grid.querySelectorAll('.process-step')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let manuallyPaused = document.body.classList.contains('motion-paused') || document.body.classList.contains('motion-reduced');
  let inRange = true, frame = 0, layout = [];
  const clamp = value => Math.max(0,Math.min(1,value));
  const isPaused = () => manuallyPaused || reducedMotion.matches;

  function updateRunning() {
    grid.classList.toggle('process-running',inRange && !document.hidden && !isPaused());
  }
  function paint() {
    frame = 0;
    updateRunning();
    if (document.hidden) return;
    const paused = isPaused();
    // Read the grid once. offsetTop below is untransformed layout geometry.
    const gridTop = grid.getBoundingClientRect().top;
    const viewport = Math.max(1,window.innerHeight);
    const values = layout.map(({card,top,column}) => {
      const raw = clamp((viewport*1.02-gridTop-top)/(viewport*.62));
      const phase = Math.min(column*.065,.2);
      const progress = paused ? 1 : clamp((raw-phase)/(1-phase));
      const eased = progress*progress*(3-2*progress);
      return {card,rise:((1-eased)*104).toFixed(2),scale:(.96+eased*.04).toFixed(4),opacity:(.28+eased*.72).toFixed(3)};
    });
    values.forEach(({card,rise,scale,opacity}) => {
      card.style.setProperty('--process-rise',`${rise}px`);
      card.style.setProperty('--process-scale',scale);
      card.style.setProperty('--process-opacity',opacity);
    });
  }
  function queuePaint() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(paint);
  }
  function measure() {
    const columns = new Map();
    layout = cards.map(card => {
      const top = card.offsetTop;
      const row = Math.round(top);
      const column = columns.get(row) ?? 0;
      columns.set(row,column+1);
      return {card,top,column};
    });
    queuePaint();
  }
  if ('IntersectionObserver' in window) {
    const rangeObserver = new IntersectionObserver(entries => {
      inRange = entries[0].isIntersecting;
      updateRunning();
      if (inRange) queuePaint();
    },{rootMargin:'180px 0px'});
    rangeObserver.observe(grid);
    const iconObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.classList.toggle('is-process-visible',entry.isIntersecting));
    },{threshold:0});
    cards.forEach(card => iconObserver.observe(card));
  } else cards.forEach(card => card.classList.add('is-process-visible'));
  window.addEventListener('scroll',() => { if (inRange) queuePaint(); },{passive:true});
  window.addEventListener('resize',measure,{passive:true});
  document.addEventListener('kar:languagechange',measure);
  document.addEventListener('kar:motionchange',event => {
    manuallyPaused = event.detail.paused;
    updateRunning(); queuePaint();
  });
  reducedMotion.addEventListener('change',() => { updateRunning(); queuePaint(); });
  document.addEventListener('visibilitychange',() => {
    if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; }
    updateRunning();
    if (!document.hidden) measure();
  });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(measure);
    [grid,...cards].forEach(element => observer.observe(element));
  }
  grid.classList.add('process-enhanced');
  measure();
  if (document.fonts?.ready) document.fonts.ready.then(measure);
})();
