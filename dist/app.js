/* KAR — native WebGL sculpture, progressive scroll motion, accessible UI. */
(() => {
  'use strict';
  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionButton = document.querySelector('.motion-toggle');
  const progressBar = document.querySelector('.scroll-progress');
  const hero = document.querySelector('.hero');
  const artGrid = document.querySelector('.art-grid');
  const artTag = document.querySelector('.art-tag');
  const aboutGraphic = document.querySelector('.about-graphic');
  const aboutSticker = document.querySelector('.about-sticker');
  let userPaused = false;
  let paused = reduceMotion.matches;
  let scrollY = window.scrollY;
  let pointer = { x: 0, y: 0 };
  let scrollFrame = 0;

  document.querySelector('#year').textContent = new Date().getFullYear();
  function updateMotion() {
    paused = userPaused || reduceMotion.matches;
    body.classList.toggle('motion-paused', userPaused);
    body.classList.toggle('motion-reduced', reduceMotion.matches);
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.innerHTML = paused ? 'Enable motion <span aria-hidden="true">▷</span>' : 'Pause motion <span aria-hidden="true">Ⅱ</span>';
    if (reduceMotion.matches) {
      motionButton.disabled = true;
      motionButton.innerHTML = 'Reduced motion <span aria-hidden="true">✓</span>';
      motionButton.title = 'Your device’s reduced-motion preference is enabled.';
    } else {
      motionButton.disabled = false;
      motionButton.removeAttribute('title');
    }
    updateParallax();
    requestSculptureFrame();
  }
  motionButton.addEventListener('click', () => { userPaused = !userPaused; updateMotion(); });
  reduceMotion.addEventListener('change', updateMotion);

  function updateScroll() {
    scrollY = window.scrollY;
    const length = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    progressBar.style.transform = `scaleX(${Math.min(1, scrollY / length)})`;
    scrollFrame = 0;
    updateParallax();
    if (!paused) requestSculptureFrame();
  }
  function updateParallax() {
    const travel = paused ? 0 : Math.min(scrollY, hero.offsetHeight);
    artGrid.style.transform = `translate3d(0,${travel * .13}px,0)`;
    artTag.style.transform = `translate3d(0,${travel * -.07}px,0) rotate(-8deg)`;
    const rect = aboutGraphic.getBoundingClientRect();
    const offset = paused ? 0 : Math.max(-35, Math.min(35, (window.innerHeight / 2 - rect.top - rect.height / 2) * .09));
    aboutSticker.style.transform = `translate3d(0,${offset}px,0) rotate(9deg)`;
  }
  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }, { passive: true });
  document.querySelector('.hero-art').addEventListener('pointermove', event => {
    if (paused || event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointer = { x: ((event.clientX - rect.left) / rect.width - .5) * 2, y: ((event.clientY - rect.top) / rect.height - .5) * 2 };
    requestSculptureFrame();
  });
  document.querySelector('.hero-art').addEventListener('pointerleave', () => { pointer = { x: 0, y: 0 }; });

  if ('IntersectionObserver' in window) {
    if (!reduceMotion.matches) body.classList.add('js-motion');
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); } });
    }, { threshold: .08 });
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
  }

  const menuButton = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('#mobile-nav');
  function closeMenu() {
    mobileNav.hidden = true;
    body.classList.remove('menu-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
  }
  menuButton.addEventListener('click', () => {
    const opening = mobileNav.hidden;
    mobileNav.hidden = !opening;
    body.classList.toggle('menu-open', opening);
    menuButton.setAttribute('aria-expanded', String(opening));
    menuButton.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
  });
  mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  window.matchMedia('(min-width: 761px)').addEventListener('change', event => { if (event.matches) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !mobileNav.hidden) { closeMenu(); menuButton.focus(); } });

  const services = [...document.querySelectorAll('.service')];
  services.forEach((details, index) => {
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      services.forEach(other => { if (other !== details) other.open = false; });
      document.querySelector('#visual-number').textContent = String(index + 1).padStart(2, '0');
      document.querySelector('.wire-cube').style.filter = `hue-rotate(${index * 28}deg)`;
    });
  });

  const dialog = document.querySelector('#enquiry-dialog');
  const form = document.querySelector('#enquiry-form');
  const result = document.querySelector('#brief-result');
  const briefText = document.querySelector('#brief-text');
  const briefStatus = document.querySelector('#brief-status');
  let brief = '';
  function openEnquiry(service) {
    if (service) document.querySelector('#service-select').value = service;
    form.hidden = false;
    result.hidden = true;
    dialog.showModal();
    body.classList.add('dialog-open');
  }
  document.querySelector('#open-enquiry').addEventListener('click', () => openEnquiry());
  document.querySelectorAll('.service-enquire').forEach(button => button.addEventListener('click', () => openEnquiry(button.dataset.service)));
  document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => body.classList.remove('dialog-open'));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    brief = `KAR INTERNATIONAL INFOTECH\nPROJECT ENQUIRY\n\nName: ${String(data.get('name')).trim()}\nEmail: ${String(data.get('email')).trim()}\nService: ${data.get('service')}\n\nAbout the project:\n${String(data.get('message')).trim()}\n`;
    briefText.textContent = brief;
    form.hidden = true;
    result.hidden = false;
    briefStatus.textContent = 'Share this brief with your KAR contact to start the conversation.';
    document.querySelector('#copy-brief').focus();
  });
  document.querySelector('#copy-brief').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(brief); briefStatus.textContent = 'Copied. Your project brief is ready to share.'; }
    catch { briefStatus.textContent = 'Use Download .txt to save your brief, or select and copy the text above.'; }
  });
  document.querySelector('#download-brief').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([brief], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'KAR-project-brief.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    briefStatus.textContent = 'Brief downloaded. Share it with your KAR contact.';
  });
  document.querySelector('#edit-brief').addEventListener('click', () => {
    form.hidden = false; result.hidden = true; form.elements.name.focus();
  });

  /* A sculptural torus knot, rendered locally without a model download. */
  const canvas = document.querySelector('#sculpture');
  let gl;
  let frame = 0;
  let visible = true;
  let initialized = false;
  let contextLost = false;
  let render;
  function requestSculptureFrame() {
    if (initialized && !contextLost && !frame && visible && !document.hidden) frame = requestAnimationFrame(render);
  }

  const normalize = v => { const d = Math.hypot(...v) || 1; return v.map(x => x / d); };
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const subtract = (a, b) => a.map((x, i) => x - b[i]);
  const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[col*4+row] += a[k*4+row]*b[col*4+k];
    }
    return out;
  }
  function rotateX(a) { const c=Math.cos(a),s=Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); }
  function rotateY(a) { const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); }
  function rotateZ(a) { const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); }
  function translation(x,y,z) { const m=identity(); m[12]=x;m[13]=y;m[14]=z;return m; }
  function perspective(aspect) {
    const f=1/Math.tan(.64/2),n=.1,far=50;
    return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+n)/(n-far),-1, 0,0,2*far*n/(n-far),0]);
  }
  function knotMesh() {
    const positions=[], normals=[], indices=[];
    const segments=320, sides=24;
    const point=t=>[(1.38+.47*Math.cos(3*t))*Math.cos(2*t),(1.38+.47*Math.cos(3*t))*Math.sin(2*t),.62*Math.sin(3*t)];
    for(let i=0;i<=segments;i++) {
      const t=i/segments*Math.PI*2, p=point(t);
      const tangent=normalize(subtract(point(t+.001),point(t-.001)));
      const binormal=normalize(cross(tangent,[0,0,1]));
      const normal=normalize(cross(binormal,tangent));
      for(let j=0;j<=sides;j++) {
        const a=j/sides*Math.PI*2;
        const v=normal.map((n,k)=>n*Math.cos(a)+binormal[k]*Math.sin(a));
        positions.push(...p.map((x,k)=>x+v[k]*.285)); normals.push(...v);
        if(i<segments&&j<sides) {
          const a=i*(sides+1)+j,b=a+sides+1;
          indices.push(a,a+1,b,a+1,b+1,b);
        }
      }
    }
    return {positions,normals,indices};
  }
  function sphereMesh() {
    const positions=[],normals=[],indices=[],rows=24,cols=32;
    for(let i=0;i<=rows;i++) for(let j=0;j<=cols;j++) {
      const a=i/rows*Math.PI,b=j/cols*Math.PI*2;
      const n=[Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];
      normals.push(...n);positions.push(...n.map(x=>x*.23));
      if(i<rows&&j<cols) {const k=i*(cols+1)+j;indices.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1);}
    }
    return {positions,normals,indices};
  }
  try {
    gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power',premultipliedAlpha:false});
    if(!gl) throw new Error('WebGL is unavailable');
    const vertexSource=`
      attribute vec3 aPosition; attribute vec3 aNormal;
      uniform mat4 uModel; uniform mat4 uProjection; uniform mat4 uView;
      varying vec3 vNormal; varying vec3 vPosition;
      void main(){vec4 world=uModel*vec4(aPosition,1.);vPosition=world.xyz;vNormal=mat3(uModel)*aNormal;gl_Position=uProjection*uView*world;}
    `;
    const fragmentSource=`
      precision mediump float;
      varying vec3 vNormal; varying vec3 vPosition;
      uniform float uAccent;
      vec3 environment(vec3 r){
        vec3 sky=mix(vec3(.035,.052,.038),vec3(.67,.73,.61),smoothstep(-.4,.9,r.y));
        float box1=pow(max(0.,1.-abs(dot(r,normalize(vec3(.8,.2,.4))))),24.);
        float box2=pow(max(0.,dot(r,normalize(vec3(-.5,.8,1.)))),30.);
        float strip=pow(max(0.,1.-abs(r.y-.3)),65.)*.7;
        return sky+vec3(.95,.98,.88)*box1*.85+box2*vec3(1.3,1.35,1.25)+strip*vec3(.6,.75,.4);
      }
      void main(){
        vec3 n=normalize(vNormal); if(!gl_FrontFacing)n=-n;
        vec3 view=normalize(vec3(0.,0.,8.)-vPosition);
        vec3 reflectDir=reflect(-view,n);
        vec3 light=normalize(vec3(-3.,6.,5.));
        float diff=max(0.,dot(n,light));
        float fresnel=pow(1.-max(0.,dot(n,view)),3.);
        float spec=pow(max(0.,dot(n,normalize(light+view))),75.);
        vec3 metal=environment(reflectDir)*vec3(.58,.63,.56)+vec3(.08,.095,.07)*diff;
        metal=mix(metal,vec3(.095,.13,.075),fresnel*.32)+vec3(.85)*spec*.5;
        float ao=.78+.22*smoothstep(-1.2,1.3,vPosition.z);
        metal*=ao;
        vec3 accent=vec3(.54,.82,.13)*(.4+diff*.6)+vec3(.8)*spec*.8;
        vec3 color=mix(metal,accent,uAccent);
        color=color/(color+vec3(.62)); color=pow(color,vec3(.83));
        gl_FragColor=vec4(color,1.);
      }
    `;
    function compile(type,source) {
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(message);}
      return shader;
    }
    const program=gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const uniforms=Object.fromEntries(['uModel','uProjection','uView','uAccent'].map(name=>[name,gl.getUniformLocation(program,name)]));
    const attributes={position:gl.getAttribLocation(program,'aPosition'),normal:gl.getAttribLocation(program,'aNormal')};
    function upload(mesh) {
      const buffers={};
      for(const [key,source] of [['position',mesh.positions],['normal',mesh.normals]]) {
        buffers[key]=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffers[key]);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(source),gl.STATIC_DRAW);
      }
      buffers.index=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buffers.index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(mesh.indices),gl.STATIC_DRAW);
      buffers.count=mesh.indices.length;return buffers;
    }
    const knot=upload(knotMesh()),sphere=upload(sphereMesh());
    gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
    gl.uniformMatrix4fv(uniforms.uView,false,translation(0,0,-8));
    function draw(mesh,model,accent) {
      for(const key of ['position','normal']) {
        gl.bindBuffer(gl.ARRAY_BUFFER,mesh[key]);gl.enableVertexAttribArray(attributes[key]);gl.vertexAttribPointer(attributes[key],3,gl.FLOAT,false,0,0);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.index);
      gl.uniformMatrix4fv(uniforms.uModel,false,model);gl.uniform1f(uniforms.uAccent,accent);
      gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,0);
    }
    let previousTime=0,elapsed=0,smoothX=0,smoothY=0,lastDraw=0;
    function resize() {
      const rect=canvas.getBoundingClientRect();
      const dpr=Math.min(window.devicePixelRatio||1,1.6);
      const width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));
      if(canvas.width!==width||canvas.height!==height) {canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
      gl.uniformMatrix4fv(uniforms.uProjection,false,perspective(width/height));
      requestSculptureFrame();
    }
    render=time=>{
      frame=0;
      if(contextLost||document.hidden||!visible) {previousTime=0;return;}
      if(!paused&&time-lastDraw<32) {requestSculptureFrame();return;}
      if(previousTime&&!paused) elapsed+=Math.min((time-previousTime)/1000,.06);
      previousTime=time;lastDraw=time;
      smoothX+=(pointer.x-smoothX)*.07;smoothY+=(pointer.y-smoothY)*.07;
      const scroll=paused?0:Math.min(scrollY/Math.max(hero.offsetHeight,1),1.4);
      const spin=paused?0:elapsed*.105;
      let model=multiply(rotateZ(-.36+scroll*.2),multiply(rotateX(.48+smoothY*.13+scroll*.35),rotateY(.35+spin+smoothX*.2)));
      model=multiply(translation(-.05,Math.sin(elapsed*.7)*(!paused?.045:0)+scroll*.2,0),model);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      draw(knot,model,0);
      draw(sphere,translation(1.7+Math.sin(spin)*.1,-1.32+Math.cos(elapsed*.65)*(!paused?.07:0),.6),1);
      if(!paused) requestSculptureFrame();
    };
    initialized=true;
    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){previousTime=0;requestSculptureFrame();}},{rootMargin:'80px'}).observe(hero);
    document.addEventListener('visibilitychange',()=>{previousTime=0;requestSculptureFrame();});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;body.classList.remove('webgl-ready');});
    canvas.addEventListener('webglcontextrestored',()=>{contextLost=true;body.classList.remove('webgl-ready');});
    body.classList.add('webgl-ready');
    resize();
  } catch {
    body.classList.remove('webgl-ready');
  }
  updateMotion();
  updateScroll();
})();
