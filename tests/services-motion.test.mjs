import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../dist/services.js',import.meta.url),'utf8');
const number = value => Number.parseFloat(value)||0;
const translation = body => number(/translate3d\(0,(-?[\d.]+)px/.exec(body.style.transform)?.[1]);

// Native document flow, sticky bounds and untransformed body content are independent.
function fixture({height=800,headerHeight=108,navHeight=88,contentHeights=[900,1200,700,1000],summaryHeights=[76,76,76,76],paused=false,preferences=null,columnBounds={left:18,right:372}}={}) {
  const queue = new Map(), anchors = [], scrolls = [], windows = [], runways = [], bodies = [];
  let frameId = 1;
  class Target {
    constructor() {
      this.events = {}; this.attributes = {}; this.properties = {}; this.classes = new Set(); this.hidden = false;
      this.classList = {add:value => this.classes.add(value),toggle:(value,on) => on ? this.classes.add(value) : this.classes.delete(value)};
      this.style = {setProperty:(name,value) => {this.properties[name] = value;}};
    }
    addEventListener(name,callback) { (this.events[name] ??= []).push(callback); }
    emit(name,event={}) { this.events[name]?.forEach(callback => callback(event)); }
    setAttribute(name,value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    append(body) { this.body = body; }
  }
  const window = new Target(); window.scrollY = 0; window.innerHeight = height;
  window.scrollTo = options => {window.scrollY=options.top;scrolls.push(options);window.emit('scroll');};
  const document = new Target(); document.body = {matches:() => paused}; document.dispatchEvent = () => {};
  const header = new Target(); header.getBoundingClientRect = () => ({height:headerHeight});
  const section = new Target(), list = new Target(), layout = new Target(), visual = new Target(), headings = new Target();
  list.getBoundingClientRect = () => columnBounds;
  const panel = preferences ? new Target() : null;
  let panelBounds = preferences?.bounds;
  const panelStyle = {position:'fixed',display:'flex',visibility:'visible',opacity:'1',...preferences?.style};
  if (panel) {
    panel.hidden = Boolean(preferences.hidden);
    panel.getBoundingClientRect = () => ({...panelBounds,width:panelBounds.right-panelBounds.left,height:panelBounds.bottom-panelBounds.top});
  }
  const stacked = () => section.classes.has('services-stacked');
  const cardHeight = i => stacked() ? number(section.properties['--service-frame-height']) : contentHeights[i]+summaryHeights[i]+50;
  const naturalTop = index => 1200+Array.from({length:index},(_,i) => cardHeight(i)+48+number(runways[i]?.style.height)).reduce((a,b) => a+b,0);
  headings.scrollWidth=600;headings.clientWidth=600;headings.scrollLeft=0;
  headings.getBoundingClientRect = () => ({height:navHeight,left:0,right:600});
  const links = Array.from({length:4},() => new Target());
  links.forEach((link,i) => {link.getBoundingClientRect = () => ({left:i*150-headings.scrollLeft,right:(i+1)*150-headings.scrollLeft});});
  headings.querySelectorAll = () => links;
  const cards = Array.from({length:4},(_,i) => {
    const card = new Target(), summary = new Target(), title = {textContent:'Service '+(i+1)}, body = new Target();
    card.summary=summary;body.scrollHeight=contentHeights[i];bodies[i]=body;
    card.querySelector = selector => ({summary,'h3':title,'.service-body':body})[selector];
    card.before = anchor => {anchor.getBoundingClientRect = () => ({top:naturalTop(i)-window.scrollY});anchors[i]=anchor;};
    card.after = runway => {runways[i]=runway;};
    body.before = viewport => {
      windows[i]=viewport;
      viewport.getBoundingClientRect = () => {
        const top=card.getBoundingClientRect().top+25+summaryHeights[i];
        const height=stacked() ? number(viewport.properties['--service-body-height']) : contentHeights[i];
        return {top,bottom:top+height,height};
      };
    };
    body.getBoundingClientRect = () => {const top=windows[i].getBoundingClientRect().top+translation(body);return {top,bottom:top+contentHeights[i],height:contentHeights[i]};};
    card.getBoundingClientRect = () => {
      const normal=naturalTop(i)-window.scrollY;
      const listBottom=naturalTop(3)+cardHeight(3)+number(runways[3]?.style.height)-window.scrollY;
      const top=stacked() ? Math.min(Math.max(normal,number(card.properties['--card-top'])),listBottom-cardHeight(i)) : normal;
      return {top,bottom:top+cardHeight(i),height:cardHeight(i)};
    };
    summary.getBoundingClientRect = () => {const top=card.getBoundingClientRect().top+25;return {top,bottom:top+summaryHeights[i],height:summaryHeights[i]};};
    return card;
  });
  list.querySelectorAll = () => cards;
  const scenes = cards.map(() => new Target()), dots = cards.map(() => new Target());
  const previous = new Target(), next = new Target(), caption = {}, controls = new Target();
  visual.dataset = {};
  visual.querySelectorAll = selector => selector === '[data-service-scene]' ? scenes : dots;
  visual.querySelector = selector => ({'[data-service-previous]':previous,'[data-service-next]':next,'#visual-number':{},'#service-visual-title':caption,'.service-visual-controls':controls})[selector];
  section.querySelector = selector => ({'.service-list':list,'.services-layout':layout,'.service-visual':visual,'.service-heading-nav':headings})[selector];
  document.querySelector = selector => ({'#services':section,'.header':header,'.site-preferences':panel})[selector] ?? null;
  document.createElement = () => new Target();
  const flush = () => {const frames=[...queue.values()];queue.clear();frames.forEach(callback => callback());};
  const observed = [];
  let notifyResize;
  class ResizeObserver {
    constructor(callback) { notifyResize=callback; }
    observe(element) { observed.push(element); }
  }
  window.ResizeObserver=ResizeObserver;
  vm.runInNewContext(source,{document,window,ResizeObserver,getComputedStyle:element => element===layout ? {marginTop:'28px'} : element===panel ? panelStyle : {paddingTop:'24px',paddingBottom:'24px',borderTopWidth:'1px',borderBottomWidth:'1px'},CustomEvent:class {},performance:{now:() => 0},requestAnimationFrame:callback => {const id=frameId++;queue.set(id,callback);return id;}});
  flush();
  return {window,document,cards,links,dots,headings,section,visual,anchors,scrolls,flush,queue,windows,bodies,runways,stacked,
    pin:index => naturalTop(index)-number(cards[index].properties['--card-top']),
    scroll(top) {window.scrollY=top;window.emit('scroll');flush();},
    focus(index,offset,height=44) {
      const target={closest:selector => selector === '.service-body' ? {} : null,getBoundingClientRect:() => {const top=bodies[index].getBoundingClientRect().top+offset;return {top,bottom:top+height,height};}};
      document.activeElement=target;cards[index].emit('focusin',{target});flush();return target;
    },
    resize(nextHeight) {window.innerHeight=nextHeight;window.emit('resize');flush();},
    resizePreferences(bounds) {assert.ok(observed.includes(panel));panelBounds=bounds;notifyResize();flush();}
  };
}

test('cards keep one height and an unchanged divider gap while long copy scrolls',() => {
  const f=fixture();const start=f.pin(0),size=f.cards[0].getBoundingClientRect().height;
  const distance=number(f.runways[0].style.height);
  assert.ok(distance>0);
  for (const progress of [0,.25,.5,1]) {
    f.scroll(start+distance*progress);
    const rect=f.cards[0].getBoundingClientRect();
    assert.equal(rect.top,108+88+28);
    assert.equal(rect.height,size);
    assert.equal(f.cards[0].summary.getBoundingClientRect().top,rect.top+25);
  }
  assert.equal(f.bodies[0].getBoundingClientRect().bottom,f.windows[0].getBoundingClientRect().bottom,'The final body line can be read');
  assert.ok(f.cards[1].getBoundingClientRect().top>=f.cards[0].getBoundingClientRect().bottom,'The next card rises after the complete description');
});

test('tall screens expose full earlier headings above equally sized rising cards',() => {
  const f=fixture({height:1100});f.scroll(f.pin(3));
  const heights=f.cards.map(card => card.getBoundingClientRect().height);
  assert.ok(heights.every(height => height===heights[0]));
  for (let i=0;i<3;i++) assert.ok(f.cards[i].summary.getBoundingClientRect().bottom<=f.cards[i+1].getBoundingClientRect().top);
  assert.ok(f.cards[3].getBoundingClientRect().bottom<=1100-24);
});

test('heading clicks, dots and arrows navigate to the start of the chosen service',() => {
  const f=fixture();let prevented=false;
  f.links[2].emit('click',{preventDefault:() => {prevented=true;}});f.flush();
  assert.equal(prevented,true);assert.equal(f.visual.dataset.activeService,'2');
  assert.equal(translation(f.bodies[2]),0);assert.equal(f.cards[2].getBoundingClientRect().top,224);
  assert.equal(f.links[2].attributes['aria-current'],'true');assert.equal(f.dots[2].attributes['aria-pressed'],'true');
  assert.equal(f.scrolls.at(-1).behavior,'smooth');
  f.dots[0].emit('click');f.flush();assert.equal(f.visual.dataset.activeService,'0');
  assert.equal(f.queue.size,0,'No continuous JavaScript animation loop');
});

test('keyboard focus reads an obscured service action without moving its heading offscreen',() => {
  const f=fixture();f.scroll(f.pin(2));const target=f.focus(0,840);
  const rect=target.getBoundingClientRect(),bounds=f.windows[0].getBoundingClientRect();
  assert.ok(rect.top>=bounds.top && rect.bottom<=bounds.bottom);
  assert.ok(f.cards[1].getBoundingClientRect().top>=rect.bottom);
  assert.equal(f.cards[0].getBoundingClientRect().top,224);
  assert.equal(f.scrolls.at(-1).behavior,'auto');
  assert.equal(f.visual.dataset.activeService,'0');
});

test('resizing preserves readable bodies and uses full natural flow on very short screens',() => {
  const f=fixture();
  for (const height of [800,375,1100,700]) {
    f.resize(height);
    if (f.stacked()) {
      f.cards.forEach((card,i) => {
        assert.ok(number(card.properties['--card-top'])>=224);
        assert.ok(number(card.properties['--card-top'])+card.getBoundingClientRect().height<=height-24);
        assert.ok(number(f.windows[i].properties['--service-body-height'])>=120);
      });
    } else {
      assert.ok(f.runways.every(runway => number(runway.style.height)===0));
      assert.ok(f.bodies.every(body => body.style.transform===''));
    }
  }
});

test('focus can reveal the final card from above or below the services section',() => {
  const above=fixture();const first=above.focus(3,0);
  assert.ok(first.getBoundingClientRect().top>=224);
  assert.ok(first.getBoundingClientRect().bottom<=776);
  const below=fixture();below.scroll(below.pin(3)+number(below.runways[3].style.height)+2000);
  const last=below.focus(3,940);
  assert.ok(last.getBoundingClientRect().top>=224);
  assert.ok(last.getBoundingClientRect().bottom<=776);
});

test('paused motion has no clipping, reading runways or smooth navigation',() => {
  const f=fixture({paused:true});assert.equal(f.stacked(),false);
  f.links[2].emit('click',{preventDefault(){}});f.flush();
  assert.equal(f.scrolls.at(-1).behavior,'auto');
  assert.ok(f.runways.every(runway => number(runway.style.height)===0));
  const target=f.focus(0,50);assert.equal(target.getBoundingClientRect().top,232);
});

test('manual scrolling still updates the active service after a card action has focus',() => {
  const f=fixture();f.scroll(f.pin(0));f.focus(0,300);
  f.scroll(f.pin(1));assert.equal(f.visual.dataset.activeService,'1');
  f.scroll(f.pin(2));assert.equal(f.visual.dataset.activeService,'2');
});

test('short-screen heading row keeps its selected title visible',() => {
  const f=fixture({height:375,headerHeight:68,navHeight:70});
  f.headings.clientWidth=280;f.headings.getBoundingClientRect=() => ({height:70,left:0,right:280});
  f.links[3].emit('click',{preventDefault(){}});f.flush();
  const bounds=f.links[3].getBoundingClientRect();assert.ok(bounds.left>=0 && bounds.right<=280);
});

test('overlapping floating controls leave the full reading window and action unobscured',() => {
  const bounds={left:98,right:378,top:732,bottom:788};
  const f=fixture({preferences:{bounds}});
  const size=f.cards[0].getBoundingClientRect().height;
  assert.equal(size,800-224-(800-bounds.top+12));
  const distance=number(f.runways[0].style.height);
  for (const progress of [0,.5,1]) {
    f.scroll(f.pin(0)+distance*progress);
    assert.equal(f.cards[0].getBoundingClientRect().height,size,'Scrolling cannot resize the pinned frame');
    assert.ok(f.cards[0].getBoundingClientRect().bottom<=bounds.top-12);
  }
  f.scroll(f.pin(3)+number(f.runways[3].style.height)+2000);
  const target=f.focus(3,940);
  assert.ok(target.getBoundingClientRect().bottom<=bounds.top-12,'The final action clears the floating controls');
  const taller={...bounds,top:700};
  f.resizePreferences(taller);
  assert.equal(f.cards[3].getBoundingClientRect().height,800-224-(800-taller.top+12),'Panel resizing updates the reserved clearance');
});

test('controls outside the card column or hidden controls reserve no extra space',() => {
  const baseline=fixture().cards[0].getBoundingClientRect().height;
  const bounds={left:850,right:1184,top:732,bottom:788};
  const outside=fixture({preferences:{bounds},columnBounds:{left:32,right:700}});
  assert.equal(outside.cards[0].getBoundingClientRect().height,baseline);
  for (const state of [{hidden:true},{style:{visibility:'hidden'}},{style:{display:'none'}},{style:{opacity:'0'}},{style:{position:'static'}}]) {
    const hidden=fixture({preferences:{bounds:{...bounds,left:98,right:378},...state}});
    assert.equal(hidden.cards[0].getBoundingClientRect().height,baseline);
  }
  for (const shifted of [{top:820,bottom:876},{top:-80,bottom:-24}]) {
    const offscreen=fixture({preferences:{bounds:{...bounds,left:98,right:378,...shifted}}});
    assert.equal(offscreen.cards[0].getBoundingClientRect().height,baseline);
  }
});
