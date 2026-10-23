/* KAR — native WebGL sculpture, progressive scroll motion, accessible UI. */
(() => {
  'use strict';
  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionButton = document.querySelector('.motion-toggle');
  const progressBar = document.querySelector('.scroll-progress');
  const hero = document.querySelector('.hero');
  const artGrid = document.querySelector('.art-grid');
  const aboutGraphic = document.querySelector('.about-graphic');
  const aboutSticker = document.querySelector('.about-sticker');
  const aboutLogo = document.querySelector('.about-background-logo');
  let userPaused = null;
  let paused = reduceMotion.matches;
  let scrollY = window.scrollY;
  let pointer = { x: 0, y: 0 };
  let scrollFrame = 0;

  document.querySelector('#year').textContent = new Date().getFullYear();
  function updateMotion() {
    paused = userPaused ?? reduceMotion.matches;
    body.classList.toggle('motion-paused', userPaused === true);
    body.classList.toggle('motion-reduced', reduceMotion.matches && userPaused !== false);
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.innerHTML = paused ? 'Enable motion <span aria-hidden="true">▷</span>' : 'Pause motion <span aria-hidden="true">Ⅱ</span>';
    motionButton.disabled = false;
    motionButton.removeAttribute('title');
    updateParallax();
    requestSculptureFrame();
    document.dispatchEvent(new CustomEvent('kar:motionchange', { detail: { paused } }));
  }
  motionButton.addEventListener('click', () => { userPaused = !paused; updateMotion(); });
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
    const rect = aboutGraphic.getBoundingClientRect();
    const offset = paused ? 0 : Math.max(-35, Math.min(35, (window.innerHeight / 2 - rect.top - rect.height / 2) * .09));
    aboutSticker.style.transform = `translate3d(0,${offset}px,0) rotate(9deg)`;
    const logoProgress = paused ? 1 : Math.max(0, Math.min(1,
      (window.innerHeight - rect.top) / Math.max(1, window.innerHeight * .75)));
    const logoEase = logoProgress * logoProgress * (3 - 2 * logoProgress);
    aboutLogo.style.transform = `translate3d(0,${(1 - logoEase) * 100}px,0) rotate(-10deg)`;

  }
  window.addEventListener('resize', updateScroll);
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

  // Repeatable scroll-linked entrances are managed by reveals.js.

  const menuButton = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('#mobile-nav');
  const header = document.querySelector('.header');
  const menuLinks = [...mobileNav.querySelectorAll('a')];
  const menuBackground = [document.querySelector('main'),document.querySelector('.footer'),header.querySelector('.brand')].filter(Boolean);
  function updateHeaderOffset() {
    document.documentElement.style.setProperty('--header-offset',`${Math.ceil(header.getBoundingClientRect().height)}px`);
  }
  function closeMenu() {
    mobileNav.hidden = true;
    body.classList.remove('menu-open');
    menuBackground.forEach(element => { element.inert = false; });
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
  }
  menuButton.addEventListener('click', () => {
    const opening = mobileNav.hidden;
    if (!opening) { closeMenu(); return; }
    updateHeaderOffset();
    mobileNav.hidden = false;
    body.classList.add('menu-open');
    menuBackground.forEach(element => { element.inert = true; });
    menuButton.setAttribute('aria-expanded', 'true');
    menuButton.setAttribute('aria-label', 'Close navigation');
    menuLinks[0]?.focus();
  });
  menuLinks.forEach(link => link.addEventListener('click', closeMenu));
  window.matchMedia('(min-width: 1201px)').addEventListener('change', event => { if (event.matches) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (mobileNav.hidden) return;
    if (event.key === 'Escape') { closeMenu(); menuButton.focus(); }
    if (event.key !== 'Tab') return;
    const controls = [menuButton,...menuLinks];
    const index = controls.indexOf(document.activeElement);
    if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === controls.length-1)) {
      event.preventDefault();
      controls[event.shiftKey ? controls.length-1 : 0].focus();
    }
  });
  window.addEventListener('resize',updateHeaderOffset,{passive:true});
  if ('ResizeObserver' in window) new ResizeObserver(updateHeaderOffset).observe(header);
  updateHeaderOffset();

  // Public enquiry and recruitment forms are managed by forms.js.

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
        vec3 sky=mix(vec3(.035,.045,.065),vec3(.70,.73,.78),smoothstep(-.4,.9,r.y));
        float box1=pow(max(0.,1.-abs(dot(r,normalize(vec3(.8,.2,.4))))),24.);
        float box2=pow(max(0.,dot(r,normalize(vec3(-.5,.8,1.)))),30.);
        float strip=pow(max(0.,1.-abs(r.y-.3)),65.)*.7;
        return sky+vec3(.95,.97,1.)*box1*.85+box2*vec3(1.3,1.33,1.38)+strip*vec3(.78,.68,.58);
      }
      void main(){
        vec3 n=normalize(vNormal); if(!gl_FrontFacing)n=-n;
        vec3 view=normalize(vec3(0.,0.,8.)-vPosition);
        vec3 reflectDir=reflect(-view,n);
        vec3 light=normalize(vec3(-3.,6.,5.));
        float diff=max(0.,dot(n,light));
        float fresnel=pow(1.-max(0.,dot(n,view)),3.);
        float spec=pow(max(0.,dot(n,normalize(light+view))),75.);
        vec3 metal=environment(reflectDir)*vec3(.58,.61,.66)+vec3(.08,.09,.11)*diff;
        metal=mix(metal,vec3(.075,.095,.13),fresnel*.32)+vec3(.85)*spec*.5;
        float ao=.78+.22*smoothstep(-1.2,1.3,vPosition.z);
        metal*=ao;
        vec3 accent=vec3(.973,.416,.016)*(.4+diff*.6)+vec3(.8)*spec*.8;
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
    const knot=upload(knotMesh());
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
      const spin=paused?0:elapsed*.28;
      let model=multiply(rotateZ(-.36+scroll*.2),multiply(rotateX(.48+smoothY*.13+scroll*.35),rotateY(.35+spin+smoothX*.2)));
      model=multiply(translation(-.05,Math.sin(elapsed*.7)*(!paused?.045:0)+scroll*.2,0),model);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      draw(knot,model,0);
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
