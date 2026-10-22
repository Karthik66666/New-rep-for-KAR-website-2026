/* Local solid 3D service models; animations share the site's motion controls. */
(() => {
  'use strict';
  const panel = document.querySelector('.service-visual');
  if (!panel) return;
  const create = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function solidBox(width, height, depth, className = '') {
    const box = create('div', `sv-solid ${className}`);
    const faces = [
      ['front',width,height,`translateZ(${depth/2}px)`],
      ['back',width,height,`rotateY(180deg) translateZ(${depth/2}px)`],
      ['right',depth,height,`rotateY(90deg) translateZ(${width/2}px)`],
      ['left',depth,height,`rotateY(-90deg) translateZ(${width/2}px)`],
      ['top',width,depth,`rotateX(90deg) translateZ(${height/2}px)`],
      ['bottom',width,depth,`rotateX(-90deg) translateZ(${height/2}px)`]
    ];
    faces.forEach(([name,w,h,transform]) => {
      const face = create('span', `sv-solid-face sv-face-${name}`);
      Object.assign(face.style, {width:`${w}px`,height:`${h}px`,left:`${-w/2}px`,top:`${-h/2}px`,transform});
      box.append(face);
    });
    return box;
  }
  function cylinder(radius, depth) {
    const body = create('div', 'sv-cylinder');
    ['front','back'].forEach(name => {
      const disc = create('span', `sv-gear-disc sv-gear-disc-${name}`);
      Object.assign(disc.style, {
        width:`${radius*2}px`,height:`${radius*2}px`,left:`${-radius}px`,top:`${-radius}px`,
        transform:`${name === 'back' ? 'rotateY(180deg) ' : ''}translateZ(${depth/2}px)`
      });
      body.append(disc);
    });
    const sides = 32, width = 2*radius*Math.tan(Math.PI/sides) + .35;
    for (let index = 0; index < sides; index++) {
      const angle = index/sides*Math.PI*2;
      const edge = create('span', 'sv-cylinder-edge');
      const light = .72 + .22*Math.cos(angle-.8);
      edge.style.setProperty('--edge-gold', [211,175,55].map(channel => Math.round(channel*light)).join(' '));
      Object.assign(edge.style, {
        width:`${width}px`,height:`${depth}px`,left:`${-width/2}px`,top:`${-depth/2}px`,
        transform:`rotateZ(${index/sides*360}deg) rotateX(90deg) translateZ(${radius}px)`
      });
      body.append(edge);
    }
    return body;
  }
  function stage(name) {
    const model = create('div', `service-model sv-stage sv-stage-${name}`);
    model.setAttribute('aria-hidden', 'true');
    return model;
  }
  function gears() {
    const model = stage('gears');
    const assembly = create('div', 'sv-model-origin sv-gears-assembly');
    [false,true].forEach(second => {
      const mount = create('div', `sv-gear-mount${second ? ' sv-gear-mount-second' : ''}`);
      const rotor = create('div', `sv-gear-rotor${second ? ' sv-gear-rotor-second' : ''}`);
      for (let index = 0; index < 12; index++) {
        const tooth = solidBox(19,25,20,'sv-gear-tooth');
        tooth.style.transform = `rotateZ(${index*30}deg) translateY(-50px)`;
        rotor.append(tooth);
      }
      rotor.append(cylinder(46,20));
      const hub = create('span', 'sv-gear-hub');
      hub.append(create('i', 'sv-gear-hub-pin'));
      rotor.append(hub);
      mount.append(rotor);
      assembly.append(mount);
    });
    model.append(assembly);
    return model;
  }
  function phone() {
    const model = stage('phone');
    const origin = create('div','sv-model-origin sv-phone-assembly');
    const floating = create('div','sv-phone-float');
    const handset = solidBox(122,224,16,'sv-phone-body');
    const screen = create('div','sv-app-screen');
    const status = create('div','sv-app-status');
    status.append(create('b','', '9:41'),create('span','sv-app-signal','▰'));
    screen.append(status,create('span','sv-phone-notch'));
    const header = create('div','sv-app-header');
    header.append(create('span','sv-app-mark','K'),create('span','sv-app-greeting','Hello, there.'));
    screen.append(header,create('strong','sv-app-title','A better way\nto connect.'));
    const feature = create('div','sv-app-feature');
    feature.append(create('span','','YOUR WORKSPACE'),create('strong','','24'),create('small','','Ideas moving forward'));
    screen.append(feature);
    const actions = create('div','sv-app-actions');
    [['↗','Explore'],['✓','Projects'],['+','Create']].forEach(([symbol,label]) => {
      const tile = create('span','sv-app-action');
      tile.append(create('i','',symbol),create('small','',label));
      actions.append(tile);
    });
    screen.append(actions,create('div','sv-app-homebar'));
    handset.querySelector('.sv-face-front').append(screen);
    handset.querySelector('.sv-face-back').append(create('span','sv-phone-back-mark','KAR'));
    const camera = solidBox(24,34,3,'sv-phone-camera');
    camera.style.transform = 'translate3d(-37px,-82px,-9px) rotateY(180deg)';
    const lens = create('i','sv-phone-camera-lens');
    camera.querySelector('.sv-face-front').append(lens);
    handset.append(camera);
    const button = solidBox(3,25,5,'sv-phone-side-button');
    button.style.transform = 'translate3d(62px,-44px,0)';
    handset.append(button);
    floating.append(handset);
    [['✓',-87,45,24,-13],['↗',86,-55,17,12]].forEach(([symbol,x,y,z,angle],index) => {
      const mount = create('div',`sv-phone-card sv-phone-card-${index}`);
      mount.style.transform = `translate3d(${x}px,${y}px,${z}px) rotateZ(${angle}deg)`;
      const card = solidBox(45,45,8,'sv-app-card-body');
      card.querySelector('.sv-face-front').append(create('span','sv-app-card-symbol',symbol));
      mount.append(card);
      floating.append(mount);
    });
    origin.append(floating);
    model.append(origin);
    return model;
  }
  function growth() {
    const model = stage('growth');
    const origin = create('div','sv-model-origin sv-growth-assembly');
    const platform = solidBox(181,9,82,'sv-growth-platform');
    platform.style.transform = 'translate3d(0,88px,0)';
    origin.append(platform);
    [60,98,138].forEach((height,index) => {
      const mount = create('div',`sv-bar-mount sv-bar-mount-${index}`);
      mount.style.transform = `translate3d(${-57+index*57}px,83px,0)`;
      const lift = create('div','sv-bar-lift');
      lift.style.setProperty('--bar-delay',`${index*-.65}s`);
      const bar = solidBox(36,height,37,'sv-growth-bar');
      bar.style.transform = `translateY(${-height/2}px)`;
      const detail = create('span','sv-bar-detail');
      detail.append(create('i'),create('i'),create('i'));
      bar.querySelector('.sv-face-front').append(detail);
      lift.append(bar);
      mount.append(lift);
      origin.append(mount);
    });
    origin.append(create('span','sv-growth-orbit-ring'));
    const orbit = create('div','sv-arrow-orbit');
    const arrow = create('div','sv-growth-arrow');
    const shaft = solidBox(77,12,12,'sv-arrow-shaft');
    shaft.style.transform = 'translateX(-7px)';
    arrow.append(shaft);
    [-1,1].forEach(direction => {
      const head = solidBox(34,12,12,'sv-arrow-head');
      head.style.transform = `translate3d(26px,${direction*10}px,0) rotateZ(${-direction*42}deg)`;
      arrow.append(head);
    });
    orbit.append(arrow);
    origin.append(orbit);
    model.append(origin);
    return model;
  }
  [gears,phone,growth].forEach((build,index) => {
    const wrapper = panel.querySelector(`[data-service-scene="${index+1}"]`);
    if (wrapper && !wrapper.querySelector('.service-model')) wrapper.append(build());
  });

  let visible = false;
  let paused = document.body.classList.contains('motion-paused') || document.body.classList.contains('motion-reduced');
  function sync() {
    panel.classList.toggle('visuals-running',visible && !paused && !document.hidden && panel.getBoundingClientRect().width > 0);
  }
  document.addEventListener('kar:motionchange',event => { paused = Boolean(event.detail.paused); sync(); });
  document.addEventListener('kar:servicechange',sync);
  document.addEventListener('visibilitychange',sync);
  window.addEventListener('resize',sync,{passive:true});
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); },{threshold:.03}).observe(panel);
  } else { visible = true; sync(); }
})();
