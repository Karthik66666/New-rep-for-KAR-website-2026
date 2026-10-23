import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../dist/content.js',import.meta.url),'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const published = (overrides = {}) => ({clients:[],projects:[],jobs:[],...overrides});
const response = data => ({ok:true,headers:{get:() => 'application/json'},json:async () => data});

function page(fetcher) {
  function node(tag = 'div') {
    return {tagName:tag,children:[],dataset:{},textContent:'',hidden:false,listeners:{},
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      addEventListener(type,listener) { this.listeners[type] = listener; }};
  }
  const nodes = Object.fromEntries(['#client-logos','#project-grid','#works .works-heading > p','#job-list','#jobs-empty'].map(key => [key,node()]));
  const documentListeners = {}, windowListeners = {}, timers = new Map(), events = [];
  let nextTimer = 0, modal = false;
  const document = {hidden:false,activeElement:null,
    querySelector:selector => selector === 'dialog[open]' ? modal ? {} : null : nodes[selector],
    createElement:node,addEventListener:(name,callback) => { documentListeners[name] = callback; },
    dispatchEvent:event => { events.push(event.type); documentListeners[event.type]?.(event); }};
  const forms = {opened:[],openApplication(job) { this.opened.push(job); }};
  const window = {addEventListener:(name,callback) => { windowListeners[name] = callback; },karForms:forms};
  let interval;
  vm.runInNewContext(source,{window,document,URL,AbortController,CustomEvent:class { constructor(type) { this.type = type; } },location:{origin:'http://127.0.0.1:4173'},
    fetch:fetcher,setTimeout:(callback,delay) => { const id = ++nextTimer; timers.set(id,{callback,delay}); return id; },
    clearTimeout:id => timers.delete(id),setInterval:callback => { interval = callback; }});
  return {nodes,forms,document,window,timers,events,setModal:value => { modal = value; },
    focus:() => windowListeners.focus(),event:name => documentListeners[name](),
    refresh:() => interval(),runTimer(delay) { const [id,timer] = [...timers].find(([,timer]) => timer.delay === delay) ?? []; assert.ok(timer); timers.delete(id); timer.callback(); }};
}

test('a stalled CMS request times out so focus can refresh the published content',async () => {
  const signals = [];
  const p = page((_url,{signal}) => {
    signals.push(signal);
    if (signals.length > 1) return Promise.resolve(response(published({clients:[{name:'Published client'}]})));
    return new Promise((_resolve,reject) => signal.addEventListener('abort',() => reject(new Error('Timed out'))));
  });
  p.focus(); assert.equal(signals.length,1,'a pending request must not be duplicated');
  p.runTimer(15000); await settle();
  assert.equal(signals[0].aborted,true);
  p.focus(); await settle();
  assert.equal(signals.length,2);
  assert.equal(p.nodes['#client-logos'].children[0].children[0].textContent,'Published client');
  assert.equal(p.timers.size,0,'completed requests release their timeout');
});

test('CMS names stay plain text and only approved URL schemes create images and links',async () => {
  const p = page(async () => response(published({
    clients:[{name:'<img src=x onerror=alert(1)>',logo:'javascript:alert(1)'}],
    projects:[{title:'Unsafe link',summary:'Plain text',image:'http://example.test/image.png',url:'javascript:alert(1)'},
      {title:'Published project',summary:'Approved',image:'/media/approved.webp',url:'https://example.test/work'}]
  })));
  await settle();
  const client = p.nodes['#client-logos'].children[0];
  assert.equal(client.children.length,1);
  assert.equal(client.children[0].textContent,'<img src=x onerror=alert(1)>');
  const [unsafe,safe] = p.nodes['#project-grid'].children;
  assert.equal(unsafe.children.some(child => ['a','img'].includes(child.tagName)),false);
  assert.equal(safe.children[0].src,'http://127.0.0.1:4173/media/approved.webp');
  assert.equal(safe.children.at(-1).href,'https://example.test/work');
  assert.equal(safe.children.at(-1).rel,'noopener noreferrer');
});

test('client cards retain accessible names and notify the rotator after CMS updates',async () => {
  let clients = Array.from({length:12},(_,index) => ({name:`Client ${index+1}`,logo:`/media/client-${index+1}.png`}));
  const p = page(async () => response(published({clients})));
  await settle();
  const cards = p.nodes['#client-logos'].children;
  assert.equal(cards.length,12,'All published clients remain available to the motion module');
  const image = cards[0].children[0].children[0];
  assert.equal(cards[0].children[0].className,'client-logo-mark');
  assert.equal(image.alt,'Client 1');
  assert.equal(image.src,'http://127.0.0.1:4173/media/client-1.png');
  assert.equal(cards[0].children[1].textContent,'Client 1');
  assert.deepEqual(p.events,['kar:clientschange']);
  clients = [{name:'Newly approved client',logo:'/media/new.png'}];
  p.refresh(); await settle();
  assert.equal(p.nodes['#client-logos'].children.length,1);
  assert.equal(p.nodes['#client-logos'].children[0].children[0].children[0].alt,'Newly approved client');
  assert.deepEqual(p.events,['kar:clientschange','kar:clientschange']);
});

test('deferred job cards resolve the latest role and refuse applications to withdrawn roles',async () => {
  let jobs = [{id:'role-1',title:'Original role',description:'Original questions',questions:[]}];
  const p = page(async () => response(published({jobs})));
  await settle();
  const button = p.nodes['#job-list'].children[0].children.at(-1);
  p.setModal(true);
  jobs = [{...jobs[0],title:'Updated role',questions:[{id:'tools',label:'Which tools?'}]}];
  p.refresh(); await settle();
  assert.equal(p.nodes['#job-list'].children[0].children[0].textContent,'Original role');
  button.listeners.click();
  assert.equal(p.forms.opened[0].title,'Updated role');
  assert.equal(p.forms.opened[0].questions[0].id,'tools');
  jobs = []; p.refresh(); await settle(); button.listeners.click();
  assert.equal(p.forms.opened.length,1);
  assert.equal(button.disabled,true);
  assert.equal(button.textContent,'This role is no longer available.');
  p.setModal(false); p.event('kar:formclosed');
  assert.equal(p.nodes['#job-list'].hidden,true);
  assert.equal(p.nodes['#jobs-empty'].hidden,false);
});

test('offline refreshes preserve published cards and hidden tabs do not fetch',async () => {
  let calls = 0, offline = false;
  const p = page(async () => {
    calls++; if (offline) throw new TypeError('Offline');
    return response(published({projects:[{title:'Saved project',summary:'Available content'}]}));
  });
  await settle(); offline = true; p.refresh(); await settle();
  assert.equal(p.nodes['#project-grid'].children[0].children[0].textContent,'Saved project');
  p.document.hidden = true; p.refresh(); p.focus(); await settle();
  assert.equal(calls,2);
});
