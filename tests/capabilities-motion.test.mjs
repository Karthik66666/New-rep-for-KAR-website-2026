import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../dist/capabilities.js',import.meta.url),'utf8');
function page({reduced=false,observer=true,parentTop=800}={}) {
  class Target {
    constructor() {
      this.events={};this.classes=new Set();this.properties={};
      this.classList={add:name=>this.classes.add(name),toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};
      this.style={setProperty:(name,value)=>{this.properties[name]=value;}};
    }
    addEventListener(name,callback){(this.events[name]??=[]).push(callback);}
    emit(name,event={}){this.events[name]?.forEach(callback=>callback(event));}
  }
  const words=Array.from({length:4},()=>new Target());
  const strip=new Target();strip.offsetTop=40;strip.offsetHeight=100;strip.offsetParent={offsetTop:parentTop,offsetParent:null};
  strip.querySelectorAll=()=>words;
  const document=new Target();document.hidden=false;document.body={matches:()=>false};document.querySelector=()=>strip;
  const window=new Target();window.innerHeight=800;window.scrollY=0;
  const media=new Target();media.matches=reduced;
  const queue=new Map(),observers=[];let next=1;
  class IntersectionObserver {constructor(callback){this.callback=callback;observers.push(this);}observe(){}}
  if(observer)window.IntersectionObserver=IntersectionObserver;
  vm.runInNewContext(source,{window,document,matchMedia:()=>media,IntersectionObserver,
    requestAnimationFrame:callback=>{const id=next++;queue.set(id,callback);return id;},cancelAnimationFrame:id=>queue.delete(id)});
  const flush=()=>{const callbacks=[...queue.values()];queue.clear();callbacks.forEach(callback=>callback());};flush();
  return{words,strip,document,window,media,queue,observers,flush,
    scroll(top){window.scrollY=top;window.emit('scroll');flush();}};
}
const rise=word=>Number.parseFloat(word.properties['--capability-rise']);

test('disciplines rise in order and replay on every return down the page',()=>{
  const p=page();assert.ok(p.words.every(word=>rise(word)===68));
  p.scroll(152);
  assert.ok(rise(p.words[0])>0 && rise(p.words[0])<68);
  assert.ok(rise(p.words[0])<rise(p.words[1]));assert.equal(rise(p.words[2]),68);
  p.scroll(232);assert.equal(rise(p.words[0]),0);assert.ok(rise(p.words[3])>0);
  p.scroll(488);assert.ok(p.words.every(word=>rise(word)===0));
  for(let visit=0;visit<3;visit++) {
    p.scroll(0);assert.ok(p.words.every(word=>rise(word)===68));
    p.scroll(152);assert.equal(rise(p.words[0]),34);assert.ok(rise(p.words[0])<rise(p.words[1]));
    p.scroll(488);assert.ok(p.words.every(word=>rise(word)===0));
  }
  assert.equal(p.queue.size,0,'No continuous animation frame loop');
});

test('word positions follow current document layout after language changes',()=>{
  const p=page({parentTop:400});p.scroll(100);assert.ok(p.words.every(word=>rise(word)===0));
  p.strip.offsetParent.offsetTop=900;p.document.emit('kar:languagechange');p.flush();
  assert.ok(p.words.every(word=>rise(word)===68));
  p.scroll(600);assert.ok(p.words.every(word=>rise(word)===0));
});

test('an offscreen completed strip resets when it enters again from below',()=>{
  const p=page();p.scroll(488);
  p.observers[0].callback([{isIntersecting:false}]);p.scroll(-200);
  assert.ok(p.words.every(word=>rise(word)===0));
  p.observers[0].callback([{isIntersecting:true}]);p.flush();
  assert.ok(p.words.every(word=>rise(word)===68));
  p.scroll(152);assert.equal(rise(p.words[0]),34);
});

test('star loops require actual visibility and stop when hidden or motion is paused',()=>{
  const p=page();assert.equal(p.strip.classes.has('capabilities-running'),false);
  p.observers[1].callback([{isIntersecting:true}]);assert.equal(p.strip.classes.has('capabilities-running'),true);
  p.window.emit('scroll');assert.equal(p.queue.size,1);
  p.document.hidden=true;p.document.emit('visibilitychange');assert.equal(p.queue.size,0);
  assert.equal(p.strip.classes.has('capabilities-running'),false);
  p.document.hidden=false;p.document.emit('visibilitychange');p.flush();
  p.document.emit('kar:motionchange',{detail:{paused:true}});p.flush();
  assert.equal(p.strip.classes.has('capabilities-running'),false);assert.ok(p.words.every(word=>rise(word)===0));
  p.scroll(152);assert.ok(p.words.every(word=>rise(word)===0));
  p.document.emit('kar:motionchange',{detail:{paused:false}});p.flush();
  assert.equal(rise(p.words[0]),34,'Resuming restores the current scroll position');
  assert.equal(p.strip.classes.has('capabilities-running'),true);
});

test('reduced motion immediately shows every word without decorative loops',()=>{
  const p=page({reduced:true});p.observers[1].callback([{isIntersecting:true}]);
  assert.ok(p.words.every(word=>rise(word)===0));assert.equal(p.strip.classes.has('capabilities-running'),false);
});

test('offscreen strips avoid scroll frames, including without visibility observers',()=>{
  const p=page();p.observers[0].callback([{isIntersecting:false}]);p.window.emit('scroll');assert.equal(p.queue.size,0);
  const fallback=page({observer:false});fallback.scroll(200);assert.equal(fallback.strip.classes.has('capabilities-running'),true);
  fallback.scroll(1000);assert.equal(fallback.strip.classes.has('capabilities-running'),false);
});
