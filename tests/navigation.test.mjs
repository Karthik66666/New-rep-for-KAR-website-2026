import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
function page() {
  let document, headerHeight = 83;
  class Target {
    constructor() {
      this.events = {}; this.attributes = {}; this.classes = new Set(); this.properties = {};
      this.style = {setProperty:(name,value) => {this.properties[name] = value;}};
      this.classList = {add:name => this.classes.add(name),remove:name => this.classes.delete(name),
        contains:name => this.classes.has(name),toggle:(name,on) => on ? this.classes.add(name) : this.classes.delete(name)};
    }
    addEventListener(name,callback) { (this.events[name] ??= []).push(callback); }
    emit(name,event={}) { this.events[name]?.forEach(callback => callback(event)); }
    setAttribute(name,value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    focus() { document.activeElement = this; }
    getBoundingClientRect() { return {top:200,height:300,width:600,left:0}; }
  }
  document = new Target(); document.body = new Target(); document.documentElement = new Target();
  document.documentElement.scrollHeight = 3000;
  const selectors = ['.motion-toggle','.scroll-progress','.hero','.art-grid','.about-graphic','.about-sticker','.about-background-logo',
    '#year','.hero-art','.menu-toggle','#mobile-nav','.header','main','.footer','.brand','#sculpture'];
  const nodes = Object.fromEntries(selectors.map(selector => [selector,new Target()]));
  nodes['.hero'].offsetHeight = 700;
  nodes['#mobile-nav'].hidden = true;
  const links = [new Target(),new Target(),new Target()];
  nodes['#mobile-nav'].querySelectorAll = () => links;
  nodes['.header'].querySelector = () => nodes['.brand'];
  nodes['.header'].getBoundingClientRect = () => ({height:headerHeight});
  nodes['#sculpture'].getContext = () => null;
  document.querySelector = selector => nodes[selector];
  document.dispatchEvent = event => document.emit(event.type,event);
  const window = new Target(), media = new Map();
  Object.assign(window,{scrollY:0,innerHeight:800});
  window.matchMedia = query => {
    if (!media.has(query)) {const target = new Target();target.matches = false;media.set(query,target);}
    return media.get(query);
  };
  vm.runInNewContext(source,{window,document,requestAnimationFrame:() => 1,CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}}});
  return {document,window,nodes,links,media,resize(height) {headerHeight=height;window.emit('resize');}};
}

test('mobile navigation moves focus inside and makes covered content inert',() => {
  const p = page(); p.nodes['.menu-toggle'].emit('click');
  assert.equal(p.nodes['#mobile-nav'].hidden,false);
  assert.equal(p.document.activeElement,p.links[0]);
  for (const selector of ['main','.footer','.brand']) assert.equal(p.nodes[selector].inert,true);
  assert.equal(p.nodes['.menu-toggle'].attributes['aria-expanded'],'true');
  p.links[1].emit('click');
  assert.equal(p.nodes['#mobile-nav'].hidden,true);
  for (const selector of ['main','.footer','.brand']) assert.equal(p.nodes[selector].inert,false);
});

test('Tab stays inside an open menu and Escape restores the toggle',() => {
  const p = page(); p.nodes['.menu-toggle'].emit('click');
  p.links.at(-1).focus(); let prevented = false;
  p.document.emit('keydown',{key:'Tab',preventDefault:() => {prevented=true;}});
  assert.equal(prevented,true); assert.equal(p.document.activeElement,p.nodes['.menu-toggle']);
  p.document.emit('keydown',{key:'Tab',shiftKey:true,preventDefault(){}});
  assert.equal(p.document.activeElement,p.links.at(-1));
  p.document.emit('keydown',{key:'Escape'});
  assert.equal(p.nodes['#mobile-nav'].hidden,true);
  assert.equal(p.document.activeElement,p.nodes['.menu-toggle']);
});

test('header offsets follow layout changes and desktop resizing unlocks content',() => {
  const p = page();
  assert.equal(p.document.documentElement.properties['--header-offset'],'83px');
  p.resize(132);assert.equal(p.document.documentElement.properties['--header-offset'],'132px');
  p.nodes['.menu-toggle'].emit('click');
  p.media.get('(min-width: 1201px)').emit('change',{matches:true});
  assert.equal(p.nodes['#mobile-nav'].hidden,true);
  assert.equal(p.nodes.main.inert,false);
  assert.equal(p.document.body.classes.has('menu-open'),false);
});

test('navigation still initializes when WebGL is unavailable',() => {
  const p = page();
  assert.equal(p.document.body.classes.has('webgl-ready'),false);
  p.nodes['.menu-toggle'].emit('click');
  assert.equal(p.nodes['#mobile-nav'].hidden,false);
  assert.ok(p.nodes['#year'].textContent > 2020);
});
