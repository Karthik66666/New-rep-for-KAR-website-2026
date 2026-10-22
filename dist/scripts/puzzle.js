/* Mirror puzzle: unequal gold pieces, real layer turns, then the inverse solve. */
(() => {
  'use strict';
  const scene = document.querySelector('.puzzle-scene');
  if (!scene) return;
  const cube = scene.querySelector('.mirror-puzzle');
  const panel = scene.closest('.service-visual');
  const identity = () => [1,0,0, 0,1,0, 0,0,1];
  const product = (a, b) => a.map((_, i) => {
    const row = Math.floor(i / 3), col = i % 3;
    return a[row*3]*b[col] + a[row*3+1]*b[3+col] + a[row*3+2]*b[6+col];
  });
  const vector = (matrix, point) => [0,1,2].map(row =>
    matrix[row*3]*point[0] + matrix[row*3+1]*point[1] + matrix[row*3+2]*point[2]);
  const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const unit = point => { const length = Math.hypot(...point); return point.map(value => value / length); };
  const keyLight = unit([-.45,-.7,1.4]);
  const fillLight = unit([1,.15,.6]);
  const rimLight = unit([.5,-.45,-1]);
  const reflection = unit([keyLight[0],keyLight[1],keyLight[2]+1]);
  const fillReflection = unit([fillLight[0],fillLight[1],fillLight[2]+1]);
  const goldColor = [211,175,55]; // Metallic Gold #D3AF37, before lighting.
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const camera = [0,0,850];
  const subtract = (a,b) => a.map((value,index) => value-b[index]);
  const addScaled = (point,axis,distance) => point.map((value,index) => value+axis[index]*distance);
  function readDepth() {
    return window.getComputedStyle ? parseFloat(window.getComputedStyle(scene).getPropertyValue('--puzzle-depth')) || 120 : 120;
  }
  let reflectionDepth = readDepth();
  const faceAxes = {
    front:[[0,0,1],[1,0,0],[0,1,0]],
    back:[[0,0,-1],[-1,0,0],[0,1,0]],
    right:[[1,0,0],[0,0,-1],[0,1,0]],
    left:[[-1,0,0],[0,0,1],[0,1,0]],
    top:[[0,-1,0],[1,0,0],[0,0,1]],
    bottom:[[0,1,0],[1,0,0],[0,0,-1]]
  };
  function rotation(axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    if (axis === 0) return [1,0,0, 0,c,-s, 0,s,c];
    if (axis === 1) return [c,0,s, 0,1,0, -s,0,c];
    return [c,-s,0, s,c,0, 0,0,1];
  }
  function transform(piece, turn = identity()) {
    const orientation = product(turn, piece.orientation);
    piece.displayOrientation = orientation;
    const point = vector(turn, piece.position);
    piece.displayPosition = point;
    // CSS matrix3d is column-major; our rotation matrices are row-major.
    piece.element.style.transform = `matrix3d(${[
      orientation[0],orientation[3],orientation[6],0,
      orientation[1],orientation[4],orientation[7],0,
      orientation[2],orientation[5],orientation[8],0,
      ...point,1
    ].join(',')})`;
  }
  function updateLighting(angle = 32) {
    // Match CSS transform order so reflections follow a fixed studio light.
    const stage = product(rotation(0,-24*Math.PI/180),
      product(rotation(1,angle*Math.PI/180),rotation(2,-6*Math.PI/180)));
    pieces.forEach(piece => {
      const world = product(stage,piece.displayOrientation);
      const centre = addScaled(vector(stage,piece.displayPosition),[0,0,1],reflectionDepth);
      piece.goldFaces.forEach(face => {
        const [normal,tangent,vertical] = face.axes.map(axis => vector(world,axis));
        face.worldNormal = normal;
        face.worldTangent = tangent;
        face.worldVertical = vertical;
        const faceOffset = vector(world,face.localCentre);
        face.worldCentre = centre.map((value,index) => value+faceOffset[index]);
        const key = Math.max(0,dot(normal,keyLight));
        const fill = Math.max(0,dot(normal,fillLight));
        const rim = Math.max(0,dot(normal,rimLight));
        const alignment = Math.max(0,dot(normal,reflection));
        const fillAlignment = Math.max(0,dot(normal,fillReflection));
        const specular = Math.min(1,Math.pow(alignment,24)*.6 + Math.pow(alignment,8)*.25 + Math.pow(fillAlignment,18)*.2);
        // A bright studio environment keeps unlit gold faces warm, rather than near-black.
        const exposure = .62 + key*.36 + fill*.2;
        const shineX = dot(tangent,keyLight), shineY = dot(vertical,keyLight);
        const values = {
          '--gold-r':String(Math.min(255,Math.round(goldColor[0]*exposure + specular*56 + rim*18))),
          '--gold-g':String(Math.min(245,Math.round(goldColor[1]*exposure + specular*62 + rim*17))),
          '--gold-b':String(Math.min(214,Math.round(goldColor[2]*exposure + specular*82 + rim*18))),
          '--face-light':(.55 + key*.45).toFixed(2),
          '--glint':(.16 + specular*.64 + rim*.08).toFixed(2),
          '--shine-x':`${Math.round(50 + shineX*60)}%`,
          '--shine-y':`${Math.round(50 + shineY*60)}%`,
          '--glow-angle':`${Math.round(Math.atan2(shineY,shineX)*180/Math.PI + 90)}deg`
        };
        face.color = [values['--gold-r'],values['--gold-g'],values['--gold-b']].join(' ');
        Object.entries(values).forEach(([name,value]) => {
          if (face.previous[name] !== value) {
            face.element.style.setProperty(name,value);
            face.previous[name] = value;
          }
        });
      });
    });
  }
  function clipPolygon(points,signedDistance) {
    const result = [];
    points.forEach((point,index) => {
      const next = points[(index+1)%points.length];
      const a = signedDistance(point), b = signedDistance(next);
      if (a >= 0) result.push(point);
      if ((a >= 0) !== (b >= 0)) {
        const t = a/(a-b);
        result.push(point.map((value,axis) => value+(next[axis]-value)*t));
      }
    });
    return result;
  }
  function reflectedPolygon(receiver,donor) {
    const normal = receiver.worldNormal, centre = receiver.worldCentre;
    let corners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) =>
      addScaled(addScaled(donor.worldCentre,donor.worldTangent,x*donor.width/2),donor.worldVertical,y*donor.height/2));
    corners = clipPolygon(corners,point => dot(subtract(point,centre),normal)-.05);
    if (corners.length < 3) return null;
    const virtualCentre = addScaled(donor.worldCentre,normal,-2*dot(subtract(donor.worldCentre,centre),normal));
    const virtualNormal = addScaled(donor.worldNormal,normal,-2*dot(donor.worldNormal,normal));
    if (dot(virtualNormal,subtract(camera,virtualCentre)) <= 0) return null;
    const numerator = dot(subtract(centre,camera),normal);
    let valid = true;
    let points = corners.map(point => {
      const reflected = addScaled(point,normal,-2*dot(subtract(point,centre),normal));
      const ray = subtract(reflected,camera);
      const denominator = dot(ray,normal);
      if (Math.abs(denominator) < .001) { valid = false; return [0,0]; }
      const t = numerator/denominator;
      if (t <= 0 || t > 1.001) { valid = false; return [0,0]; }
      const hit = subtract(addScaled(camera,ray,t),centre);
      return [dot(hit,receiver.worldTangent)+receiver.width/2,dot(hit,receiver.worldVertical)+receiver.height/2];
    });
    if (!valid) return null;
    for (const distance of [p=>p[0],p=>receiver.width-p[0],p=>p[1],p=>receiver.height-p[1]]) {
      points = clipPolygon(points,distance);
      if (points.length < 3) return null;
    }
    const area = Math.abs(points.reduce((sum,point,index) => {
      const next = points[(index+1)%points.length];
      return sum+point[0]*next[1]-next[0]*point[1];
    },0))/2;
    if (area < 1.5) return null;
    return {points,color:donor.color,depth:Math.hypot(...subtract(camera,virtualCentre))};
  }
  function updateReflections() {
    // Approximate one planar bounce from neighboring gold pieces; no floor clone.
    reflectiveFaces.forEach(receiver => {
      const facing = dot(receiver.worldNormal,unit(subtract(camera,receiver.worldCentre)));
      const candidates = facing > .08 ? reflectiveFaces.flatMap(donor => {
        if (donor === receiver || donor.piece === receiver.piece) return [];
        const reflected = reflectedPolygon(receiver,donor);
        return reflected ? [reflected] : [];
      }).sort((a,b)=>a.depth-b.depth).slice(0,6).reverse() : [];
      candidates.forEach((candidate,index) => {
        let polygon = receiver.polygons[index];
        if (!polygon) {
          polygon = document.createElementNS(svgNamespace,'polygon');
          receiver.surface.append(polygon);
          receiver.polygons.push(polygon);
        }
        polygon.style.display = '';
        polygon.setAttribute('points',candidate.points.map(point=>point.map(value=>value.toFixed(2)).join(',')).join(' '));
        polygon.setAttribute('fill',`rgb(${candidate.color})`);
      });
      receiver.polygons.slice(candidates.length).forEach(polygon => { polygon.style.display = 'none'; });
    });
  }

  const cuts = [[-70,-30,30,110],[-82,-30,30,98],[-102,-30,30,78]];
  const pieces = [];
  const fragment = document.createDocumentFragment();
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
    const indices = [x,y,z];
    const dimensions = indices.map((index, axis) => cuts[axis][index+1] - cuts[axis][index] - 3);
    const [w,h,d] = dimensions;
    const element = document.createElement('div');
    element.className = 'puzzle-piece';
    const goldFaces = [];
    const faces = [
      [w,h,`translateZ(${d/2}px)`,z === 2,'front'],
      [w,h,`rotateY(180deg) translateZ(${d/2}px)`,z === 0,'back'],
      [d,h,`rotateY(90deg) translateZ(${w/2}px)`,x === 2,'right'],
      [d,h,`rotateY(-90deg) translateZ(${w/2}px)`,x === 0,'left'],
      [w,d,`rotateX(90deg) translateZ(${h/2}px)`,y === 0,'top'],
      [w,d,`rotateX(-90deg) translateZ(${h/2}px)`,y === 2,'bottom']
    ];
    faces.forEach(([width,height,placement,gold,name]) => {
      const face = document.createElement('span');
      face.className = `puzzle-face puzzle-${name}${gold ? ' puzzle-gold' : ''}`;
      Object.assign(face.style, {
        width:`${width}px`,height:`${height}px`,
        left:`${-width/2}px`,top:`${-height/2}px`,transform:placement
      });
      element.append(face);
      if (gold) {
        const surface = document.createElementNS(svgNamespace,'svg');
        surface.setAttribute('class','puzzle-self-reflection');
        surface.setAttribute('viewBox',`0 0 ${width} ${height}`);
        surface.setAttribute('aria-hidden','true');
        surface.setAttribute('focusable','false');
        face.append(surface);
        const distance = ['front','back'].includes(name) ? d/2 : ['left','right'].includes(name) ? w/2 : h/2;
        goldFaces.push({element:face,axes:faceAxes[name],localCentre:faceAxes[name][0].map(value=>value*distance),width,height,surface,polygons:[],previous:{}});
      }
    });
    const piece = {
      element,
      goldFaces,
      grid:indices.map(index => index - 1),
      position:indices.map((index, axis) => (cuts[axis][index] + cuts[axis][index+1]) / 2),
      orientation:identity()
    };
    goldFaces.forEach(face => { face.piece = piece; });
    transform(piece);
    pieces.push(piece);
    fragment.append(element);
  }
  cube.append(fragment);
  const reflectiveFaces = pieces.flatMap(piece => piece.goldFaces);
  updateLighting();
  updateReflections();
  scene.classList.add('puzzle-ready');

  const scramble = [[0,1,1],[1,0,-1],[2,-1,1],[0,-1,-1],[1,1,1],[2,0,-1]];
  const moves = [...scramble, ...scramble.slice().reverse().map(([axis,layer,direction]) => [axis,layer,-direction])];
  let moveIndex = 0, phase = 'rest', phaseTime = 0, active = null;
  let frame = 0, lastTime = 0, rotationTime = 0, lastReflection = 0;
  let visible = false;
  let paused = document.body.classList.contains('motion-paused') || document.body.classList.contains('motion-reduced');
  function canAnimate() {
    return !paused && visible && !document.hidden &&
      (panel.dataset.activeService || '0') === '0' && panel.getBoundingClientRect().width > 0;
  }
  function schedule() {
    if (!frame && canAnimate()) frame = requestAnimationFrame(animate);
  }
  function sync() {
    if (!canAnimate()) {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    } else schedule();
  }
  function beginTurn() {
    const [axis,layer,direction] = moves[moveIndex];
    active = {axis,direction,pieces:pieces.filter(piece => piece.grid[axis] === layer)};
    phase = 'turn';
    phaseTime = 0;
  }
  function animate(time) {
    frame = 0;
    if (!canAnimate()) { lastTime = 0; return; }
    // Cap updates near 30 fps without losing animation time.
    if (lastTime && time - lastTime < 32) { schedule(); return; }
    const delta = lastTime ? Math.min(time - lastTime, 80) : 0;
    lastTime = time;
    rotationTime += delta;
    phaseTime += delta;
    const angle = 32 + rotationTime*.006;
    cube.style.transform = `translateZ(var(--puzzle-depth,120px)) rotateX(-24deg) rotateY(${angle}deg) rotateZ(-6deg)`;
    if (phase === 'rest') {
      if (phaseTime >= (moveIndex === 0 ? 1800 : 420)) beginTurn();
    } else {
      const progress = Math.min(1, phaseTime / 1350);
      const eased = progress*progress*(3 - 2*progress);
      const turn = rotation(active.axis, active.direction * Math.PI/2 * eased);
      active.pieces.forEach(piece => transform(piece, turn));
      if (progress === 1) {
        const quarter = rotation(active.axis, active.direction * Math.PI/2).map(Math.round);
        active.pieces.forEach(piece => {
          piece.grid = vector(quarter, piece.grid).map(Math.round);
          piece.position = vector(quarter, piece.position);
          piece.orientation = product(quarter, piece.orientation);
          transform(piece);
        });
        moveIndex = (moveIndex + 1) % moves.length;
        active = null;
        phase = 'rest';
        phaseTime = moveIndex === scramble.length ? -900 : 0;
      }
    }
    updateLighting(angle);
    if (time-lastReflection >= 120) { updateReflections(); lastReflection = time; }
    schedule();
  }
  document.addEventListener('kar:motionchange', event => { paused = event.detail.paused; sync(); });
  document.addEventListener('kar:servicechange', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', () => {
    reflectionDepth = readDepth();
    updateLighting(32+rotationTime*.006);
    updateReflections();
    sync();
  }, {passive:true});
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }, {threshold:.05}).observe(panel);
  } else { visible = true; sync(); }
})();
