/* Native scrolling lifts each complete service card over the previous card. */
(() => {
  'use strict';
  const section = document.querySelector('#services');
  if (!section) return;
  const list = section.querySelector('.service-list');
  const preferences = document.querySelector('.site-preferences');
  const layout = section.querySelector('.services-layout');
  const visual = section.querySelector('.service-visual');
  const headings = section.querySelector('.service-heading-nav');
  const links = [...headings.querySelectorAll('a')];
  const items = [...list.querySelectorAll('.service')];
  const scenes = [...visual.querySelectorAll('[data-service-scene]')];
  const dots = [...visual.querySelectorAll('[data-service-select]')];
  const previous = visual.querySelector('[data-service-previous]');
  const next = visual.querySelector('[data-service-next]');
  const windows = [], bodies = [], runways = [];
  const anchors = items.map((item,index) => {
    const anchor = document.createElement('div');
    anchor.className = 'service-scroll-anchor';
    anchor.setAttribute('aria-hidden','true');
    item.before(anchor);
    item.open = true;
    item.style.setProperty('--card-layer',String(index+1));
    const body = item.querySelector('.service-body');
    const window = document.createElement('div');
    window.className = 'service-body-window';
    body.before(window); window.append(body);
    const runway = document.createElement('div');
    runway.className = 'service-reading-runway';
    runway.setAttribute('aria-hidden','true'); item.after(runway);
    windows.push(window); bodies.push(body); runways.push(runway);
    return anchor;
  });
  let active = -1, frame = 0, baseTop = 0, bottomClearance = 24, navigation = null;
  let stacking = false;
  const cardTops = [], readingDistances = [], readingOffsets = [], bodyHeights = [];
  let paused = document.body.matches('.motion-paused, .motion-reduced');

  function select(index) {
    if (index === active) return;
    active = index;
    items.forEach((item,i) => item.classList.toggle('is-active',i === index));
    links.forEach((link,i) => {
      if (i === index) link.setAttribute('aria-current','true');
      else link.removeAttribute('aria-current');
    });
    // Short landscape screens use a scrollable row; keep its active title in view.
    if (headings.scrollWidth > headings.clientWidth) {
      const bounds = headings.getBoundingClientRect();
      const link = links[index].getBoundingClientRect();
      if (link.left < bounds.left) headings.scrollLeft -= bounds.left-link.left;
      else if (link.right > bounds.right) headings.scrollLeft += link.right-bounds.right;
    }
    scenes.forEach((scene,i) => {
      scene.hidden = i !== index;
      scene.classList.toggle('is-active',i === index);
    });
    dots.forEach((button,i) => button.setAttribute('aria-pressed',String(i === index)));
    previous.disabled = index === 0;
    next.disabled = index === items.length-1;
    visual.dataset.activeService = String(index);
    visual.querySelector('#visual-number').textContent = String(index+1).padStart(2,'0');
    visual.querySelector('#service-visual-title').textContent = items[index].querySelector('h3').textContent;
    document.dispatchEvent(new CustomEvent('kar:servicechange',{detail:{index}}));
  }
  function measure() {
    const headerHeight = document.querySelector('.header').getBoundingClientRect().height;
    section.style.setProperty('--services-nav-top',`${headerHeight}px`);
    // Match the initial distance below the divider; scrolling must not shrink it.
    const gap = parseFloat(getComputedStyle(layout).marginTop) || 28;
    baseTop = headerHeight + headings.getBoundingClientRect().height + gap;
    section.style.setProperty('--services-top',`${baseTop}px`);
    const metrics = items.map(item => {
      const style = getComputedStyle(item);
      return {summary:item.querySelector('summary').getBoundingClientRect().height,
        padding:(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0),
        border:(parseFloat(style.borderTopWidth)||0)+(parseFloat(style.borderBottomWidth)||0)};
    });
    // Reserve the floating controls only where they cover the card column.
    // Recalculate with layout measurements, never with scrolling, so frames stay fixed.
    bottomClearance = 24;
    if (preferences && !preferences.hidden) {
      const style = getComputedStyle(preferences);
      const panel = preferences.getBoundingClientRect();
      const column = list.getBoundingClientRect();
      if (style.position === 'fixed' && style.display !== 'none' && !['hidden','collapse'].includes(style.visibility) && style.opacity !== '0' &&
          panel.width > 0 && panel.height > 0 && panel.bottom > 0 && panel.top < window.innerHeight &&
          panel.left < column.right && panel.right > column.left) {
        bottomClearance = Math.max(24,Math.ceil(window.innerHeight-Math.max(0,panel.top)+12));
      }
    }
    const available = Math.floor(window.innerHeight-baseTop-bottomClearance);
    const strips = metrics.map(metric => Math.ceil(metric.summary+metric.padding/2+2));
    const reserved = strips.slice(0,-1).reduce((total,height) => total+height,0);
    // Expose complete earlier headings only when the remaining card can be read.
    const exposeHeadings = available-reserved >= 300;
    const cardHeight = available-(exposeHeadings ? reserved : 0);
    stacking = !paused && available >= 260 && metrics.every(metric => cardHeight-metric.summary-metric.padding-metric.border >= 120);
    section.classList.toggle('services-stacked',stacking);
    section.style.setProperty('--service-frame-height',`${Math.max(0,cardHeight)}px`);
    let offset = 0;
    metrics.forEach((metric,index) => {
      cardTops[index] = Math.round(baseTop+offset);
      bodyHeights[index] = Math.max(1,cardHeight-metric.summary-metric.padding-metric.border);
      items[index].style.setProperty('--card-top',`${cardTops[index]}px`);
      windows[index].style.setProperty('--service-body-height',`${bodyHeights[index]}px`);
      if (stacking && exposeHeadings) offset += strips[index];
    });
    // Extra document space reads long copy with the normal page scrollbar.
    // The card itself keeps one width, height and padding throughout the stack.
    const distances = bodies.map((body,index) => stacking ? Math.max(0,Math.ceil(body.scrollHeight-bodyHeights[index])) : 0);
    distances.forEach((distance,index) => {
      readingDistances[index] = distance;
      runways[index].style.height = `${distance}px`;
    });
    queueUpdate();
  }
  function update() {
    frame = 0;
    if (navigation && (performance.now() > navigation.until || Math.abs(window.scrollY-navigation.top) < 3)) navigation = null;
    const positions = anchors.map(anchor => anchor.getBoundingClientRect().top);
    let index = 0;
    positions.forEach((top,i) => {
      if (top <= cardTops[i]+48) index = i;
    });
    positions.forEach((top,i) => {
      const offset = stacking ? Math.max(0,Math.min(readingDistances[i],cardTops[i]-top)) : 0;
      readingOffsets[i] = offset;
      bodies[i].style.transform = stacking ? `translate3d(0,${-offset}px,0)` : '';
    });
    select(navigation ? navigation.index : index);
  }
  function queueUpdate() { if (!frame) frame = requestAnimationFrame(update); }
  function goTo(index) {
    index = Math.max(0,Math.min(items.length-1,index));
    select(index);
    const top = Math.max(0,window.scrollY+anchors[index].getBoundingClientRect().top-cardTops[index]);
    navigation = {index,top,until:performance.now()+2000};
    window.scrollTo({top,behavior:paused ? 'auto' : 'smooth'});
  }
  function uncoverFocus(index,target) {
    select(index);
    const targetRect = target.getBoundingClientRect();
    const covered = items.slice(index+1).some(later => {
      const bounds = later.getBoundingClientRect();
      return bounds.top < targetRect.bottom && bounds.bottom > targetRect.top;
    });
    const anchorTop = window.scrollY+anchors[index].getBoundingClientRect().top;
    let top;
    if (stacking) {
      const bounds = windows[index].getBoundingClientRect();
      if (!covered && targetRect.top >= Math.max(bounds.top,baseTop+8) && targetRect.bottom <= Math.min(bounds.bottom,window.innerHeight-bottomClearance)) return;
      const naturalOffset = targetRect.top-bounds.top+(readingOffsets[index]||0);
      const read = Math.max(0,Math.min(readingDistances[index],naturalOffset-bodyHeights[index]+targetRect.height+8));
      top = anchorTop-cardTops[index]+read;
    } else {
      const visibleTop = baseTop+8;
      if (!covered && targetRect.top >= visibleTop && targetRect.bottom <= window.innerHeight-bottomClearance) return;
      top = window.scrollY+targetRect.top-visibleTop;
    }
    top = Math.max(0,top);
    navigation = {index,top,until:performance.now()+2000};
    window.scrollTo({top,behavior:'auto'});
  }
  links.forEach((link,index) => link.addEventListener('click',event => {
    event.preventDefault();
    goTo(index);
  }));
  items.forEach((item,index) => {
    item.querySelector('summary').addEventListener('click',event => {
      event.preventDefault();
      goTo(index);
    });
    // Uncover keyboard actions that may be behind a later card.
    item.addEventListener('focusin',event => {
      if (event.target.closest('.service-body')) uncoverFocus(index,event.target);
      else if (active !== index) goTo(index);
    });
  });
  dots.forEach((button,index) => button.addEventListener('click',() => goTo(index)));
  previous.addEventListener('click',() => goTo(active-1));
  next.addEventListener('click',() => goTo(active+1));
  const cancelNavigation = () => { navigation = null; queueUpdate(); };
  window.addEventListener('wheel',cancelNavigation,{passive:true});
  window.addEventListener('touchstart',cancelNavigation,{passive:true});
  window.addEventListener('keydown',event => {
    if (['ArrowDown','ArrowUp','PageDown','PageUp','Home','End'].includes(event.key)) cancelNavigation();
  });
  document.addEventListener('kar:motionchange',event => { paused = event.detail.paused; measure(); });
  window.addEventListener('scroll',queueUpdate,{passive:true});
  window.addEventListener('resize',measure,{passive:true});
  document.addEventListener('kar:languagechange',() => {
    visual.querySelector('#service-visual-title').textContent = items[active].querySelector('h3').textContent;
    measure();
  });
  section.classList.add('services-enhanced');
  visual.querySelector('.service-visual-controls').hidden = false;
  select(0);
  measure();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(measure);
    [headings,document.querySelector('.header'),preferences,...items,...bodies].filter(Boolean).forEach(element => observer.observe(element));
  }
  if (document.fonts?.ready) document.fonts.ready.then(measure);
})();
