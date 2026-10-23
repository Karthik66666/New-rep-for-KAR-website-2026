import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/reveals.js',import.meta.url),'utf8');
function page({intro=false,reduced=false}={}) {
  class Target {
    constructor(top=0,parent=null) {
      this.events={};this.properties={};this.classes=new Set();this.offsetTop=top;this.offsetParent=parent;
      this.style={setProperty:(key,value)=>{this.properties[key]=value;}};
      this.classList={add:name=>this.classes.add(name)};
    }
    addEventListener(name,callback){(this.events[name]??=[]).push(callback);}
    emit(name,event={}){this.events[name]?.forEach(callback=>callback(event));}
    contains(target){for(let node=target;node;node=node.offsetParent)if(node===this)return true;return false;}
    closest(selector){return selector==='#intro' ? this.intro??null : this.section??this;}
    getBoundingClientRect(){throw new Error('Animated geometry must not drive its own progress');}
  }
  const section=new Target(800);section.id=intro?'intro':'about';
  const elements=intro?[section,new Target(96,section),new Target(150,section)]:[new Target(40,section)];
  for(const element of elements){element.section=section;if(intro)element.intro=section;}
  const document=new Target();document.body=new Target();document.body.matches=()=>false;document.activeElement=null;document.hidden=false;
  document.querySelectorAll=()=>elements;
  const window=new Target();window.innerHeight=800;window.scrollY=0;
  const media=new Target();media.matches=reduced;
  const queue=new Map(),observers=[];let next=1;
  class ResizeObserver{constructor(callback){this.callback=callback;this.observed=[];observers.push(this);}observe(element){this.observed.push(element);}}
  window.ResizeObserver=ResizeObserver;
  vm.runInNewContext(source,{document,window,matchMedia:()=>media,ResizeObserver,
    requestAnimationFrame:callback=>{const id=next++;queue.set(id,callback);return id;},cancelAnimationFrame:id=>queue.delete(id)});
  const flush=()=>{const callbacks=[...queue.values()];queue.clear();callbacks.forEach(callback=>callback());};flush();
  return{document,window,elements,section,media,queue,observers,flush,scroll(top){window.scrollY=top;window.emit('scroll');flush();}};
}
const rise=element=>Number.parseFloat(element.properties['--reveal-rise']);

test('headings and text repeat identical rises on every up-and-down pass',()=>{
  const p=page(),target=p.elements[0];assert.equal(rise(target),32);
  for(let pass=0;pass<3;pass++) {
    p.scroll(232);const partial=rise(target);assert.ok(partial>0&&partial<32);
    p.scroll(440);assert.equal(rise(target),0);
    p.scroll(232);assert.equal(rise(target),partial);
    p.scroll(0);assert.equal(rise(target),32);
  }
  assert.equal(p.queue.size,0);assert.equal(p.document.body.classes.has('scroll-reveals'),true);
});

test('nested introduction uses stable document coordinates and repeats its stagger',()=>{
  const p=page({intro:true});assert.equal(rise(p.elements[0]),64);
  p.scroll(300);const values=p.elements.map(rise);
  assert.ok(values[0]>=0&&values[0]<64);assert.ok(values[1]<30&&values[1]>0);
  p.scroll(650);assert.ok(p.elements.every(element=>rise(element)===0));
  p.scroll(0);assert.equal(rise(p.elements[0]),64);
  p.scroll(300);assert.deepEqual(p.elements.map(rise),values);
});

test('layout changes above a reveal refresh its position without a viewport resize',()=>{
  const p=page();p.scroll(440);assert.equal(rise(p.elements[0]),0);
  assert.ok(p.observers[0].observed.includes(p.section));
  p.section.offsetTop=1400;p.observers[0].callback();p.flush();assert.equal(rise(p.elements[0]),32);
  p.section.offsetTop=800;p.document.emit('kar:languagechange');p.flush();assert.equal(rise(p.elements[0]),0);
});

test('pause and native reduced motion show complete content and resume from current scroll',()=>{
  const p=page();p.scroll(232);const partial=rise(p.elements[0]);
  p.document.emit('kar:motionchange',{detail:{paused:true}});p.flush();assert.equal(rise(p.elements[0]),0);
  p.document.emit('kar:motionchange',{detail:{paused:false}});p.flush();assert.equal(rise(p.elements[0]),partial);
  const reduced=page({reduced:true});assert.equal(rise(reduced.elements[0]),0);
});

test('focused descendants stay visible and hidden documents cancel pending work',()=>{
  const p=page({intro:true});p.document.activeElement={offsetParent:p.elements[1]};
  p.document.emit('focusin');p.flush();assert.equal(rise(p.elements[0]),0);assert.equal(rise(p.elements[1]),0);
  p.window.emit('scroll');assert.equal(p.queue.size,1);
  p.document.hidden=true;p.document.emit('visibilitychange');assert.equal(p.queue.size,0);
  p.document.activeElement=null;p.window.scrollY=650;p.document.hidden=false;p.document.emit('visibilitychange');p.flush();
  assert.ok(p.elements.every(element=>rise(element)===0));
});
