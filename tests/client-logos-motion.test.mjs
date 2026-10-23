import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/client-logos.js',import.meta.url),'utf8');
function fixture({count=12,reduced=false,paused=false,loaded=true,intersection=true,duplicates=false,missingImage=-1}={}) {
  const timers = new Map(), observers = [], preloads = [];
  let nextTimer = 1, clock = 0, bounds = {top:100,bottom:600};
  class Target {
    constructor(className='') {
      this.classes = new Set(className.split(' ').filter(Boolean)); this.events = {}; this.dataset = {};
      this.children = []; this.parentElement = null; this.hidden = false; this.textContent = ''; this.attributes = new Map();
      this.classList = {add:(...names) => names.forEach(name => this.classes.add(name)),remove:(...names) => names.forEach(name => this.classes.delete(name)),contains:name => this.classes.has(name),toggle:(name,on) => on ? this.classes.add(name) : this.classes.delete(name)};
    }
    addEventListener(name,callback) { (this.events[name] ??= new Set()).add(callback); }
    removeEventListener(name,callback) { this.events[name]?.delete(callback); }
    emit(name,event={}) { [...(this.events[name] ?? [])].forEach(callback => callback(event)); }
    append(child) { this.children.push(child); child.parentElement = this; }
    matches(selector) { return selector.split(',').some(part => this.classes.has(part.trim().slice(1))); }
    contains(node) { for (let current = node; current; current = current.parentElement) if (current === this) return true; return false; }
    querySelectorAll(selector) {
      return this.children.flatMap(child => [child,...child.querySelectorAll('*')]).filter(child => selector === '*' || (selector[0] === '.' ? child.classes.has(selector.slice(1)) : child.tagName === selector));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name,value) {
      this.attributes.set(name,value);
      if (name === 'src') { this.complete = false; this.naturalWidth = 0; (this.history ??= []).push(value); }
    }
  }
  function makeCards(length,prefix='Client',duplicateSources=false,missing=-1) {
    return Array.from({length},(_,index) => {
      const card = new Target('client-logo');
      if (index !== missing) {
        const mark = new Target('client-logo-mark'), image = new Target(); image.tagName = 'img';
        image.setAttribute('src',`/media/${prefix.toLowerCase()}-${duplicateSources ? index%8 : index}.png`);
        image.alt = `${prefix} ${index+1}`; image.complete = loaded; image.naturalWidth = loaded ? 100 : 0;
        mark.append(image); card.append(mark);
      }
      const caption = new Target('client-logo-name'); caption.tagName = 'span'; caption.textContent = `${prefix} ${index+1}`; card.append(caption);
      return card;
    });
  }
  const grid = new Target('client-logos'); grid.getBoundingClientRect = () => bounds;
  makeCards(count,'Client',duplicates,missingImage).forEach(card => grid.append(card));
  const document = new Target(); document.body = new Target(paused ? 'motion-paused' : '');
  document.querySelector = () => grid; document.hidden = false; document.activeElement = null;
  const window = new Target(); window.innerHeight = 800;
  const media = new Target(); media.matches = reduced;
  class IntersectionObserver {
    constructor(callback) { this.callback = callback; this.observed = []; this.disconnected = 0; observers.push(this); }
    observe(node) { this.observed.push(node); }
    disconnect() { this.disconnected++; }
  }
  class Image {
    constructor() { preloads.push(this); this.onload = this.onerror = null; }
    settle(success=true) { (success ? this.onload : this.onerror)?.(); }
  }
  if (intersection) window.IntersectionObserver = IntersectionObserver;
  vm.runInNewContext(source,{window,document,matchMedia:() => media,IntersectionObserver,Image,
    setTimeout:(callback,delay) => { const id = nextTimer++; timers.set(id,{callback,delay,at:clock+delay}); return id; },
    clearTimeout:id => timers.delete(id)});
  const cards = () => grid.querySelectorAll('.client-logo');
  const visible = () => cards().filter(card => !card.hidden);
  const images = () => visible().map(card => card.querySelector('img'));
  const srcs = () => images().map(image => image.getAttribute('src'));
  function next() {
    assert.ok(timers.size,'Expected scheduled work');
    const [id,task] = [...timers].sort((a,b) => a[1].at-b[1].at)[0];
    timers.delete(id); clock = task.at; task.callback(); return task;
  }
  function load(image,success=true) { image.complete = true; image.naturalWidth = success ? 100 : 0; image.emit(success ? 'load' : 'error'); }
  function show(on=true) {
    if (intersection) observers[0].callback([{target:grid,isIntersecting:on}]);
    else { bounds = on ? {top:100,bottom:600} : {top:900,bottom:1400}; window.emit('scroll'); }
  }
  function replace(length,prefix='New') {
    grid.children.forEach(card => { card.parentElement = null; }); grid.children = [];
    makeCards(length,prefix).forEach(card => grid.append(card));
    document.emit('kar:clientschange');
  }
  return {grid,document,window,media,timers,observers,preloads,cards,visible,images,srcs,next,load,show,replace};
}
const changing = f => f.visible().filter(card => card.classes.has('logo-changing'));
function beginBatch(f) {
  assert.equal(f.next().delay,2400);
  assert.equal(changing(f).length,9);
  assert.equal(f.next().delay,300);
}
function finishBatch(f) { f.images().forEach(image => f.load(image)); }

test('nine fixed tiles fade together and rotate to unique logos with every slot changed',() => {
  const f = fixture(), originalCards = f.cards(), originalImages = f.images();
  assert.equal(f.visible().length,9);
  assert.equal(f.timers.size,0,'No work before the section is visible');
  f.show();
  for (let batch = 0; batch < 24; batch++) {
    const previous = f.srcs();
    beginBatch(f);
    assert.equal(new Set(f.srcs()).size,9);
    assert.ok(f.srcs().every((src,index) => src !== previous[index]));
    assert.ok(f.srcs().some(src => !previous.includes(src)),'New batches include a previously hidden source');
    assert.equal(f.timers.size,1,'Only the load watchdog is pending');
    f.images().slice(0,8).forEach(image => f.load(image));
    assert.equal(changing(f).length,9,'The grid waits for every reused image to load');
    f.load(f.images()[8]);
    assert.equal(changing(f).length,0);
    assert.equal(f.timers.size,1);
    assert.deepEqual(f.images(),originalImages,'Image nodes are reused');
    assert.deepEqual(f.visible(),originalCards.slice(0,9),'Card slots remain stable');
    f.visible().forEach(card => assert.equal(card.querySelector('.client-logo-name').textContent,card.querySelector('img').alt));
  }
});

test('small, incomplete and duplicate-heavy collections remain fully visible and static',() => {
  for (const options of [{count:9},{count:0},{count:4},{duplicates:true},{missingImage:3},{reduced:true},{paused:true}]) {
    const f = fixture(options); f.show();
    assert.equal(f.visible().length,options.count ?? 12);
    assert.equal(f.timers.size,0);
    assert.equal(f.grid.classes.has('logos-rotating'),false);
  }
});

test('the pool loads before rotation and load failures roll the entire grid back',() => {
  const f = fixture({loaded:false}); f.show();
  assert.equal(f.preloads.length,12);
  assert.equal(f.timers.size,0,'Uncached artwork cannot start a batch');
  f.preloads.slice(0,8).forEach(image => image.settle());
  assert.equal(f.timers.size,0);
  f.preloads[8].settle();
  const previous = f.srcs(); beginBatch(f);
  f.load(f.images()[2],false);
  assert.deepEqual(f.srcs(),previous);
  assert.equal(changing(f).length,0);
  assert.ok(f.images().every(image => image.history.every(src => src.length > 0)),'Cancellation never clears an image source');
  beginBatch(f);
  assert.equal(f.next().delay,4000,'A stalled reused image has a single rollback watchdog');
  assert.deepEqual(f.srcs(),previous);
  assert.equal(changing(f).length,0);
});

test('pause and reduced motion restore every original and invalidate stale callbacks',() => {
  const f = fixture(); f.show();
  const originals = f.cards().map(card => card.querySelector('img').getAttribute('src'));
  beginBatch(f);
  const stale = [...f.timers.values()][0].callback;
  f.document.emit('kar:motionchange',{detail:{paused:true}});
  assert.equal(f.visible().length,12);
  assert.deepEqual(f.srcs(),originals);
  assert.equal(f.timers.size,0);
  stale(); assert.deepEqual(f.srcs(),originals);
  f.document.emit('kar:motionchange',{detail:{paused:false}});
  assert.equal(f.visible().length,9); assert.equal(f.timers.size,1);
  f.media.matches = true; f.media.emit('change');
  assert.equal(f.visible().length,12); assert.equal(f.timers.size,0);
  f.media.matches = false; f.media.emit('change');
  assert.equal(f.visible().length,9); assert.equal(f.timers.size,1);
});

test('hidden pages and offscreen sections cancel pending batches without timers',() => {
  const f = fixture(); f.show(); const previous = f.srcs();
  beginBatch(f); f.show(false);
  assert.equal(f.timers.size,0); assert.deepEqual(f.srcs(),previous); assert.equal(changing(f).length,0);
  f.show(); assert.equal(f.timers.size,1);
  f.document.hidden = true; f.document.emit('visibilitychange');
  assert.equal(f.timers.size,0);
  f.show(false); f.document.hidden = false; f.document.emit('visibilitychange');
  assert.equal(f.timers.size,0,'Returning to an offscreen section cannot restart rotation');
  f.show(); assert.equal(f.timers.size,1);
});

test('hover preserves the reference animation while keyboard focus suspends it',() => {
  const f = fixture(); f.show();
  f.grid.emit('pointerenter',{pointerType:'mouse'}); assert.equal(f.timers.size,1);
  beginBatch(f); finishBatch(f);
  f.grid.emit('focusin'); assert.equal(f.timers.size,0);
  f.grid.emit('focusout',{relatedTarget:f.cards()[0]}); assert.equal(f.timers.size,0);
  f.grid.emit('focusout',{relatedTarget:null}); assert.equal(f.timers.size,1);
});

test('CMS replacement and repeat notifications retain the correct original records',() => {
  const f = fixture(); f.show(); beginBatch(f);
  const stale = [...f.timers.values()][0].callback;
  f.replace(11);
  assert.equal(f.visible().length,9); assert.equal(f.timers.size,1);
  assert.ok(f.images().every(image => image.alt.startsWith('New ')));
  stale(); assert.equal(f.timers.size,1);
  beginBatch(f); finishBatch(f);
  f.document.emit('kar:clientschange');
  f.document.emit('kar:motionchange',{detail:{paused:true}});
  assert.equal(f.visible().length,11); assert.equal(f.timers.size,0);
  assert.deepEqual(f.images().map(image => image.alt),Array.from({length:11},(_,index) => `New ${index+1}`));
});

test('page lifecycle disconnects observers and waits for fresh visibility on return',() => {
  const f = fixture(); f.show(); beginBatch(f);
  f.window.emit('pagehide');
  assert.equal(f.timers.size,0); assert.equal(f.observers[0].disconnected,1); assert.equal(changing(f).length,0);
  f.window.emit('pageshow');
  assert.equal(f.observers[0].observed.length,2); assert.equal(f.timers.size,0);
  f.show(); assert.equal(f.timers.size,1);
});

test('the observer fallback checks viewport position without a frame or timer loop',() => {
  const f = fixture({intersection:false}); assert.equal(f.timers.size,1);
  f.show(false); assert.equal(f.timers.size,0);
  f.show(); assert.equal(f.timers.size,1);
  f.window.emit('resize'); assert.equal(f.timers.size,1);
});
