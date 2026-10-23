/* Nine stable tiles rotate approved logos; motion controls expose the full list. */
(() => {
  'use strict';
  const grid = document.querySelector('#client-logos');
  if (!grid) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = document.body.matches('.motion-paused, .motion-reduced');
  let originals = [], sources = [], slots = [], shown = [];
  let timer = 0, generation = 0, poolGeneration = 0, changing = null;
  let inView = false, focused = false, pageActive = true, rotating = false;
  const motionStopped = () => paused || reduced.matches;
  const canRun = () => rotating && inView && pageActive && !grid.hidden && !document.hidden && !motionStopped() && !focused;

  function write(slot, source) {
    if (slot.image.getAttribute('src') !== source.src) {
      slot.image.setAttribute('src',source.src);
    }
    slot.image.alt = source.name;
    if (slot.caption) slot.caption.textContent = source.name;
  }
  function unlisten(change) {
    slots.forEach((slot,index) => {
      slot.image.removeEventListener('load',change.loads[index]);
      slot.image.removeEventListener('error',change.error);
    });
  }
  function settle(change, restore) {
    unlisten(change);
    slots.forEach((slot,index) => {
      if (restore && change.loading) write(slot,change.previous[index]);
      slot.card.classList.remove('logo-changing');
    });
  }
  function stop() {
    generation++;
    if (timer) clearTimeout(timer);
    timer = 0;
    if (!changing) return;
    settle(changing,true);
    changing = null;
  }
  function schedule(delay, callback) {
    const current = generation;
    timer = setTimeout(() => {
      if (current !== generation) return;
      timer = 0;
      if (canRun()) callback();
    },delay);
  }
  function sync() {
    if (!canRun()) { stop(); return; }
    if (!timer && !changing && sources.filter(source => source.ready).length >= 9) schedule(2400,beginChange);
  }
  function finish(change, success) {
    if (changing !== change || change.generation !== generation) return;
    if (timer) clearTimeout(timer);
    timer = 0;
    if (success) shown = change.next;
    settle(change,!success);
    changing = null;
    sync();
  }
  function beginChange() {
    const available = sources.flatMap((source,index) => source.ready ? [index] : []);
    for (let index = available.length-1; index > 0; index--) {
      const other = Math.floor(Math.random()*(index+1));
      [available[index],available[other]] = [available[other],available[index]];
    }
    if (available.length < 9) return;
    const next = available.slice(0,9);
    // A small derangement keeps every slot different without repeating a logo.
    next.forEach((source,index) => {
      if (source !== shown[index]) return;
      const other = next.findIndex((candidate,position) => position !== index && candidate !== shown[index] && source !== shown[position]);
      [next[index],next[other]] = [next[other],next[index]];
    });
    const unseen = available.find(index => !shown.includes(index));
    if (unseen !== undefined && next.every(index => shown.includes(index))) next[0] = unseen;
    const change = {next,previous:shown.map(index => sources[index]),generation,loading:false,pending:new Set(slots.map((slot,index) => index))};
    change.loads = slots.map((slot,index) => () => {
      if (changing !== change || change.generation !== generation) return;
      change.pending.delete(index);
      if (!change.pending.size) finish(change,true);
    });
    change.error = () => finish(change,false);
    changing = change;
    slots.forEach(slot => slot.card.classList.add('logo-changing'));
    schedule(300,() => {
      change.loading = true;
      slots.forEach((slot,index) => {
        slot.image.addEventListener('load',change.loads[index]);
        slot.image.addEventListener('error',change.error);
      });
      // One watchdog shares the scheduler; restore the batch if any image fails.
      schedule(4000,() => finish(change,false));
      slots.forEach((slot,index) => write(slot,sources[next[index]]));
    });
  }
  function clearPreloads() {
    poolGeneration++;
    sources.forEach(source => {
      if (source.preload) source.preload.onload = source.preload.onerror = null;
      source.preload = null;
    });
  }
  function preload() {
    const current = poolGeneration;
    sources.forEach(source => {
      if (source.ready || source.preload || !pageActive) return;
      const image = new Image();
      source.preload = image;
      image.onload = () => {
        if (current !== poolGeneration) return;
        source.ready = true;
        image.onload = image.onerror = null;
        source.preload = null;
        sync();
      };
      image.onerror = () => { image.onload = image.onerror = null; source.preload = null; };
      image.src = source.src;
    });
  }
  function configure() {
    stop();
    originals.forEach(original => {
      original.card.hidden = false;
      original.card.classList.remove('logo-changing');
      if (original.image) write(original,original);
    });
    rotating = originals.length > 9 && sources.length > 9 && originals.every(original => original.image && original.mark && original.src);
    rotating = rotating && !motionStopped();
    grid.classList.toggle('logos-rotating',rotating);
    slots = rotating ? originals.slice(0,9) : [];
    shown = slots.map((slot,index) => { write(slot,sources[index]); return index; });
    originals.slice(slots.length || originals.length).forEach(original => { original.card.hidden = true; });
    if (rotating) preload();
    sync();
  }
  function refresh() {
    stop();
    const cards = [...grid.querySelectorAll('.client-logo')];
    // Repeated notifications must not turn a currently rotated tile into its source.
    if (cards.length !== originals.length || cards.some((card,index) => card !== originals[index].card)) {
      clearPreloads();
      originals = cards.map(card => {
        const image = card.querySelector('img'), caption = card.querySelector('.client-logo-name') || card.querySelector('span');
        return {card,image,caption,mark:card.querySelector('.client-logo-mark'),src:image?.getAttribute('src') || '',name:caption?.textContent || image?.alt || ''};
      });
      const seen = new Set();
      sources = originals.filter(original => {
        if (!original.src || seen.has(original.src)) return false;
        seen.add(original.src); return true;
      }).map(original => ({src:original.src,name:original.name,ready:original.image.complete && original.image.naturalWidth > 0,preload:null}));
    }
    configure();
    fallbackVisibility();
  }
  let observer;
  function fallbackVisibility() {
    if (observer) return;
    const bounds = grid.getBoundingClientRect();
    inView = bounds.bottom > 0 && bounds.top < window.innerHeight;
    sync();
  }
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.target === grid) inView = entry.isIntersecting;
      sync();
    },{threshold:0});
    observer.observe(grid);
  } else {
    window.addEventListener('scroll',fallbackVisibility,{passive:true});
    window.addEventListener('resize',fallbackVisibility,{passive:true});
    fallbackVisibility();
  }
  grid.addEventListener('focusin',() => { focused = true; sync(); });
  grid.addEventListener('focusout',event => { focused = grid.contains(event.relatedTarget); sync(); });
  document.addEventListener('kar:clientschange',refresh);
  document.addEventListener('kar:motionchange',event => { paused = Boolean(event.detail?.paused); configure(); });
  reduced.addEventListener('change',configure);
  document.addEventListener('visibilitychange',sync);
  window.addEventListener('pagehide',() => { pageActive = false; stop(); clearPreloads(); observer?.disconnect(); });
  window.addEventListener('pageshow',() => {
    pageActive = true; focused = grid.contains(document.activeElement);
    if (observer) { inView = false; observer.observe(grid); }
    else fallbackVisibility();
    configure();
  });
  refresh();
})();
