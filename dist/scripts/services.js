/* Natural-scroll service chapters with accessible accordion and visual controls. */
(() => {
  'use strict';
  const section = document.querySelector('#services');
  if (!section) return;
  const layout = section.querySelector('.services-layout');
  const list = section.querySelector('.service-list');
  const card = section.querySelector('.service-visual');
  const items = [...list.querySelectorAll('.service')];
  const scenes = [...card.querySelectorAll('[data-service-scene]')];
  const dots = [...card.querySelectorAll('[data-service-select]')];
  const previous = card.querySelector('[data-service-previous]');
  const next = card.querySelector('[data-service-next]');
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  let active = 0, mode = 'timeline', frame = 0, measuring = false;
  let start = 0, step = 650, stickyTop = 132;
  let navigation = null;
  let paused = document.body.classList.contains('motion-paused') || document.body.classList.contains('motion-reduced');

  function select(index) {
    index = clamp(index,0,items.length-1);
    const changed = index !== active;
    active = index;
    items.forEach((item,i) => {
      item.open = i === active;
      item.classList.toggle('is-active',i === active);
    });
    scenes.forEach((scene,i) => {
      scene.hidden = i !== active;
      scene.classList.toggle('is-active',i === active);
    });
    dots.forEach((button,i) => button.setAttribute('aria-pressed',String(i === active)));
    previous.disabled = active === 0;
    next.disabled = active === items.length-1;
    card.dataset.activeService = String(active);
    card.querySelector('#visual-number').textContent = String(active+1).padStart(2,'0');
    card.querySelector('#service-visual-title').textContent = items[active].querySelector('h3').textContent;
    if (changed) document.dispatchEvent(new CustomEvent('kar:servicechange',{detail:{index:active}}));
  }
  function measure() {
    measuring = true;
    navigation = null;
    section.classList.remove('services-pinned');
    list.style.removeProperty('height');
    layout.style.removeProperty('height');
    items.forEach(item => { item.style.removeProperty('min-height'); item.open = false; });
    stickyTop = document.querySelector('.header').getBoundingClientRect().height + 24;
    let maximumList = 0, maximumItem = 0;
    items.forEach(item => {
      item.open = true;
      maximumList = Math.max(maximumList,list.getBoundingClientRect().height);
      maximumItem = Math.max(maximumItem,item.getBoundingClientRect().height);
      item.open = false;
    });
    const available = window.innerHeight - stickyTop - 24;
    mode = window.innerWidth >= 1060 && maximumList <= available ? 'pinned' : 'timeline';
    section.classList.toggle('services-pinned',mode === 'pinned');
    section.style.setProperty('--services-top',`${stickyTop}px`);
    step = Math.max(window.innerHeight*.85,650);
    if (mode === 'pinned') {
      list.style.height = `${Math.ceil(maximumList)}px`;
      const cardHeight = Math.min(available,Math.max(430,maximumList));
      section.style.setProperty('--service-card-height',`${Math.round(cardHeight)}px`);
      layout.style.height = `${Math.ceil(Math.max(maximumList,cardHeight) + step*items.length)}px`;
    } else {
      const itemHeight = Math.ceil(Math.max(step,maximumItem+96));
      items.forEach(item => { item.style.minHeight = `${itemHeight}px`; });
      section.style.setProperty('--service-card-height','460px');
    }
    select(active);
    start = window.scrollY + layout.getBoundingClientRect().top - stickyTop;
    measuring = false;
    update();
  }
  function readPosition() {
    if (mode === 'pinned') return clamp((window.scrollY-start)/step,0,items.length-.001);
    const cardBottom = card.getBoundingClientRect().bottom;
    const line = window.innerWidth <= 760 && window.innerHeight >= 650
      ? Math.min(window.innerHeight*.7,Math.max(stickyTop+60,cardBottom+35))
      : stickyTop + (window.innerHeight-stickyTop)*.35;
    let index = 0;
    items.forEach((item,i) => { if (item.getBoundingClientRect().top <= line) index = i; });
    const rect = items[index].getBoundingClientRect();
    return index + clamp((line-rect.top)/Math.max(1,rect.height),0,.999);
  }
  function update() {
    frame = 0;
    if (measuring) return;
    const position = readPosition();
    if (navigation && (performance.now() > navigation.until || Math.abs(window.scrollY-navigation.top) < 3)) navigation = null;
    const index = navigation ? navigation.index : Math.floor(position);
    // Never close a paragraph or action while a keyboard user is interacting with it.
    const focusedBody = document.activeElement?.closest('.service-body');
    if (!focusedBody && index !== active) select(index);
    const progress = index === active ? clamp(position-index,0,1) : 1;
    items[active].style.setProperty('--service-rise',`${paused ? 0 : Math.round((1-progress)*18)}px`);
  }
  function queueUpdate() { if (!frame) frame = requestAnimationFrame(update); }
  function goTo(index) {
    index = clamp(index,0,items.length-1);
    select(index);
    const destination = mode === 'pinned'
      ? start + (index+.12)*step
      : window.scrollY + items[index].getBoundingClientRect().top - stickyTop -
        (window.innerWidth <= 760 && window.innerHeight >= 650 ? card.getBoundingClientRect().height+24 : 40);
    const top = Math.max(0,destination);
    navigation = {index,top,until:performance.now()+1800};
    window.scrollTo({top,behavior:paused ? 'auto' : 'smooth'});
  }
  items.forEach((item,index) => {
    item.querySelector('summary').addEventListener('click',event => {
      event.preventDefault();
      goTo(index);
    });
  });
  dots.forEach((button,index) => button.addEventListener('click',() => goTo(index)));
  previous.addEventListener('click',() => goTo(active-1));
  next.addEventListener('click',() => goTo(active+1));
  document.addEventListener('kar:motionchange',event => { paused = event.detail.paused; queueUpdate(); });
  window.addEventListener('scroll',queueUpdate,{passive:true});
  const cancelNavigation = () => { navigation = null; queueUpdate(); };
  window.addEventListener('wheel',cancelNavigation,{passive:true});
  window.addEventListener('touchstart',cancelNavigation,{passive:true});
  window.addEventListener('keydown',event => {
    if (['ArrowDown','ArrowUp','PageDown','PageUp','Home','End'].includes(event.key)) cancelNavigation();
  });
  window.addEventListener('resize',measure,{passive:true});
  section.classList.add('services-enhanced');
  card.querySelector('.service-visual-controls').hidden = false;
  select(0);
  measure();
  if (document.fonts?.ready) document.fonts.ready.then(measure);
})();
