import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/process.js',import.meta.url),'utf8');
function fixture({reduced=false,tops=[0,0,0]}={}) {
  const queue = new Map(), observers = [];
  let nextFrame = 1, scroll = 0;
  class Target {
    constructor() {
      this.events = {}; this.classes = new Set(); this.properties = {};
      this.classList = {add:value => this.classes.add(value),contains:value => this.classes.has(value),toggle:(value,on) => on ? this.classes.add(value) : this.classes.delete(value)};
      this.style = {setProperty:(key,value) => { this.properties[key] = value; }};
    }
    addEventListener(name,callback) { (this.events[name] ??= []).push(callback); }
    emit(name,event={}) { this.events[name]?.forEach(callback => callback(event)); }
  }
  const cards = tops.map(top => Object.assign(new Target(),{offsetTop:top}));
  const grid = new Target();
  grid.querySelectorAll = () => cards;
  grid.getBoundingClientRect = () => ({top:840-scroll});
  const document = new Target(); document.body = new Target(); document.querySelector = () => grid; document.hidden = false;
  const window = new Target(); window.innerHeight = 800;
  const media = new Target(); media.matches = reduced;
  class IntersectionObserver { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} }
  window.IntersectionObserver = IntersectionObserver;
  vm.runInNewContext(source,{window,document,matchMedia:() => media,IntersectionObserver,requestAnimationFrame:callback => {const id = nextFrame++; queue.set(id,callback); return id;},cancelAnimationFrame:id => queue.delete(id)});
  const flush = () => { const callbacks = [...queue.values()]; queue.clear(); callbacks.forEach(callback => callback()); };
  flush();
  return {cards,grid,document,window,media,observers,queue,flush,scroll(value){scroll=value;window.emit('scroll');flush();}};
}
const rise = card => Number.parseFloat(card.properties['--process-rise']);
test('cards rise gradually with scrolling and reverse with the same positions',() => {
  const f = fixture();
  assert.equal(rise(f.cards[0]),104);
  f.scroll(200); const intermediate = rise(f.cards[0]);
  assert.ok(intermediate > 0 && intermediate < 104);
  f.scroll(520); assert.equal(rise(f.cards[0]),0);
  f.scroll(200); assert.equal(rise(f.cards[0]),intermediate);
  assert.equal(f.queue.size,0,'No continuous JavaScript frame loop');
});
test('side-by-side cards stagger while stacked mobile cards use their own position',() => {
  const desktop = fixture(); desktop.scroll(250);
  assert.ok(rise(desktop.cards[0]) < rise(desktop.cards[1]));
  assert.ok(rise(desktop.cards[1]) < rise(desktop.cards[2]));
  const mobile = fixture({tops:[0,430,860]}); mobile.scroll(520);
  assert.equal(rise(mobile.cards[0]),0);
  assert.ok(rise(mobile.cards[1]) > 0);
  assert.equal(rise(mobile.cards[2]),104);
});
test('pause and reduced motion show complete cards and stop icon animation',() => {
  const f = fixture(); f.scroll(200);
  f.document.emit('kar:motionchange',{detail:{paused:true}}); f.flush();
  assert.equal(rise(f.cards[0]),0); assert.equal(f.cards[0].properties['--process-opacity'],'1.000');
  assert.equal(f.grid.classes.has('process-running'),false);
  const reduced = fixture({reduced:true});
  assert.equal(rise(reduced.cards[0]),0); assert.equal(reduced.grid.classes.has('process-running'),false);
});
test('hidden pages and offscreen sections suspend work',() => {
  const f = fixture(); f.window.emit('scroll'); assert.equal(f.queue.size,1);
  f.document.hidden = true; f.document.emit('visibilitychange'); assert.equal(f.queue.size,0);
  assert.equal(f.grid.classes.has('process-running'),false);
  f.document.hidden = false; f.document.emit('visibilitychange'); f.flush();
  f.observers[0].callback([{isIntersecting:false}]); f.window.emit('scroll');
  assert.equal(f.queue.size,0); assert.equal(f.grid.classes.has('process-running'),false);
  f.observers[1].callback([{target:f.cards[0],isIntersecting:true}]);
  assert.equal(f.cards[0].classes.has('is-process-visible'),true);
});
