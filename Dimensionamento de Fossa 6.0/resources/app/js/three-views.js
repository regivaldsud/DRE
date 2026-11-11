(function () {
  "use strict";

  const T = window.DREThree;
  const colors = { concrete: 0xa0afbf, steel: 0x456680, soil: 0xb74f28, liquid: 0x329bd0 };
  const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

  function box(group, size, position, color) {
    const mesh = new T.Mesh(new T.BoxGeometry(...size), new T.MeshLambertMaterial({ color }));
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
  }

  function line(group, points, color) {
    const geometry = new T.BufferGeometry().setFromPoints(points.map(point => new T.Vector3(...point)));
    group.add(new T.Line(geometry, new T.LineBasicMaterial({ color })));
  }

  function arrow(group, start, end, color, head) {
    const origin = new T.Vector3(...start);
    const direction = new T.Vector3(...end).sub(origin);
    const length = direction.length();
    if (length === 0) return;
    head = Math.min(head, length * 0.5);
    group.add(new T.ArrowHelper(direction.normalize(), origin, length, color, head, head * 0.65));
  }

  function viewport(host, label, home) {
    const scene = new T.Scene();
    const root = new T.Group();
    const camera = new T.OrthographicCamera();
    const renderer = new T.SVGRenderer();
    renderer.setSize(760, 410);
    renderer.setPrecision(2);
    renderer.setClearColor(new T.Color(0xe9f0f5));
    const svg = renderer.domElement;
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
    host.replaceChildren(svg);

    const sun = new T.DirectionalLight(0xffffff, 1.9);
    sun.position.set(2, 5, 3);
    scene.add(root, sun, new T.AmbientLight(0xa1a1a1));

    let view = { ...home };
    let span = 1;
    let target = new T.Vector3();
    let labels = [];
    let drag;

    function draw() {
      const { azimuth, elevation, zoom } = view;
      const distance = span * 3;
      const radius = span * 0.58 / zoom;
      camera.left = -radius * 760 / 410;
      camera.right = -camera.left;
      camera.top = radius;
      camera.bottom = -radius;
      camera.near = 0.01;
      camera.far = distance * 4;
      camera.position.set(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.cos(azimuth) * Math.cos(elevation)
      ).multiplyScalar(distance).add(target);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      for (const { point, text, color } of labels) {
        const projected = new T.Vector3(...point).project(camera);
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", (projected.x * 380).toFixed(1));
        label.setAttribute("y", (-projected.y * 205).toFixed(1));
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("font-size", "14");
        label.setAttribute("font-weight", "700");
        label.setAttribute("font-family", "Segoe UI, sans-serif");
        label.setAttribute("fill", color);
        label.setAttribute("stroke", "#e9f0f5");
        label.setAttribute("stroke-width", "4");
        label.setAttribute("paint-order", "stroke");
        label.textContent = text;
        svg.appendChild(label);
      }
    }

    function turn(dx, dy) {
      view.azimuth += dx;
      view.elevation = Math.min(1.52, Math.max(0.04, view.elevation + dy));
      draw();
    }

    host.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      host.setPointerCapture(event.pointerId);
    });
    host.addEventListener("pointermove", event => {
      if (!drag || drag.id !== event.pointerId) return;
      turn((drag.x - event.clientX) * 0.008, (event.clientY - drag.y) * 0.008);
      drag.x = event.clientX;
      drag.y = event.clientY;
    });
    host.addEventListener("lostpointercapture", () => { drag = undefined; });
    host.parentElement.querySelectorAll("[data-view-action]").forEach(button => {
      button.addEventListener("click", () => {
        switch (button.dataset.viewAction) {
          case "left": turn(-0.3, 0); return;
          case "right": turn(0.3, 0); return;
          case "in": view.zoom = Math.min(2.5, view.zoom * 1.2); break;
          case "out": view.zoom = Math.max(0.65, view.zoom / 1.2); break;
          case "front": view = { azimuth: 0, elevation: 0, zoom: 1 }; break;
          case "home": view = { ...home }; break;
        }
        draw();
      });
    });

    return {
      update(build) {
        root.clear();
        const { center, extent, annotations = [] } = build(root);
        target = new T.Vector3(...center);
        span = extent;
        labels = annotations;
        draw();
      }
    };
  }

  function moduleScene(group, module, closed) {
    const { kind, dims, dn, slab, wall } = module;
    const [length, width, height] = dims;
    const thickness = Math.min(wall, length * 0.24, width * 0.24);
    const innerL = length - 2 * thickness;
    const innerW = width - 2 * thickness;
    const drain = kind === "sumidouro";
    const concrete = drain ? 0xb0a089 : colors.concrete;

    const backCenter = -(width - thickness) / 2;
    if (closed) {
      box(group, [length, height, thickness], [0, height / 2, backCenter], concrete);
    } else {
      const rows = Math.min(12, Math.max(3, Math.round(height / 0.20)));
      const columns = Math.min(16, Math.max(3, Math.round(length / 0.40)));
      const course = height/rows;
      const block = length/columns;
      const shades = drain ? [0xb4a58f,0xae9e87,0xb8aa95] : [0xa3b0bc,0x9daab6,0xaab7c2];
      for(let row=0;row<rows;row++){
        for(let col=0;col<=columns;col++){
          const start = Math.max(0,(col-(row%2)*0.5)*block);
          const end = Math.min(length,(col+1-(row%2)*0.5)*block);
          const gap = Math.min(block,course)*0.025;
          if(end-start<=gap) continue;
          const perforation = drain && row%3===1 && col%2===1;
          box(group,[end-start-gap,course-gap,perforation ? thickness*0.76 : thickness],
            [(start+end-length)/2,(row+0.5)*course,backCenter],shades[(row*3+col*7)%shades.length]);
        }
      }
    }
    const endX = (length - thickness) / 2;
    box(group, [thickness, height, innerW], [-endX, height / 2, 0], concrete);
    if (closed) {
      box(group, [length, height, thickness], [0, height / 2, (width - thickness) / 2], concrete);
      box(group, [thickness, height, innerW], [endX, height / 2, 0], concrete);
    } else {
      box(group, [thickness, height, innerW * 0.62], [endX, height / 2, -innerW * 0.19], concrete);
    }

    if (!drain) box(group, [length, slab, width], [0, -slab / 2, 0], colors.steel).renderOrder = -1;
    if (drain) {
      const beam = Math.min(slab,height*0.12);
      box(group,[length,beam,thickness],[0,-beam/2,backCenter],0x8b8f8b).renderOrder = -1;
      for(const side of [-1,1]){
        box(group,[thickness,beam,innerW],[side*endX,-beam/2,0],0x8b8f8b).renderOrder = -1;
      }
      box(group,[length,beam,thickness],[0,-beam/2,-backCenter],0x8b8f8b).renderOrder = -1;
    }
    if (closed) {
      box(group, [length, slab, width], [0, height + slab / 2, 0], colors.steel);
      const radius = Math.min(length, width) * 0.18;
      const cap = new T.Mesh(new T.CylinderGeometry(radius, radius, slab * 0.10, 24),
        new T.MeshLambertMaterial({ color: 0x566878 }));
      cap.position.set(0, height + slab * 1.05, 0);
      group.add(cap);
    } else {
      const filter = kind === "filtro";
      const mediaHeight = height * (filter ? 0.54 : 0.16);
      if (!drain) box(group, [innerL * 0.98, mediaHeight, innerW * 0.96], [0, mediaHeight / 2, 0], filter ? 0x8b9087 : colors.liquid);
      if (filter || drain) {
        const colorsBrita = [0x757d76, 0x91948a, 0xb1aea0, 0x858577];
        const size = Math.min(innerL / 11, innerW / 6, height * 0.035);
        for (let row = 0; row < 4; row++) {
          for (let col = 0; col < 10; col++) {
            const radius = size * (0.76 + ((row * 7 + col * 13) % 11) / 32);
            const stone = new T.Mesh(new T.CylinderGeometry(radius * 0.66, radius, radius * 0.68, 5),
              new T.MeshLambertMaterial({ color: colorsBrita[(row * 3 + col) % colorsBrita.length] }));
            stone.position.set((col / 10 - 0.45) * innerL, (filter ? mediaHeight : 0) + radius * 0.31,
              (row / 4 - 0.37) * innerW);
            stone.rotation.y = (row * 3 + col) * 0.49;
            group.add(stone);
          }
        }
      }
      if (kind === "cg" || (kind === "fossa" && length >= 2 * width)) {
        const x = innerL * (kind === "cg" ? 0.05 : 1 / 6);
        box(group, [thickness, height * 0.72, innerW], [x, height * 0.5, 0], colors.steel);
      }
    }

    const stub = Math.min(length * 0.32, Math.max(0.35, width * 0.38));
    for (const side of drain ? [-1] : [-1, 1]) {
      const y = height * (kind === "filtro" && side < 0 ? 0.19 : 0.76);
      const color = side === -1 ? 0x21847b : 0xaf6229;
      const pipe = new T.Mesh(new T.CylinderGeometry(dn / 2000, dn / 2000, stub, 16, 1, true),
        new T.MeshLambertMaterial({ color, side:T.DoubleSide }));
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(side * (length + stub) / 2, y, 0);
      group.add(pipe);
      arrow(group, [pipe.position.x - stub / 2, y + dn / 1000, 0],
        [pipe.position.x + stub / 2, y + dn / 1000, 0], color, stub * 0.24);
    }
    return { center: [0, height / 2, 0], extent: Math.hypot(length + 2 * stub, width, height + 2 * slab) };
  }

  function pressureScene(group, span, height, load) {
    const { topo: top, base: bottom, alturaAplicacao, resultante } = load;
    const section = Math.min(span, height) * 0.075;
    const left = -span / 2;
    box(group, [section, height, section], [left, height / 2, 0], colors.steel);
    box(group, [section, height, section], [-left, height / 2, 0], colors.steel);
    box(group, [span + section, section, section], [0, height, 0], colors.concrete);
    box(group, [span + section, section, section], [0, 0, 0], colors.concrete);

    const maxLength = Math.max(span * 0.62, height * 0.36);
    const labelGap = height * 0.075;
    const annotations = [];
    const tick = Math.min(height, span) * 0.05;
    const dimX = span / 2 + Math.max(span * 0.3, height * 0.19);
    const dimColor = 0x425b70;
    function heightDimension(x, upper, label) {
      line(group, [[x, 0, 0], [x, upper, 0]], dimColor);
      for (const y of [0, upper]) {
        line(group, [[x - tick, y, 0], [x + tick, y, 0]], dimColor);
      }
      annotations.push({ point: [x + Math.max(span * 0.15, height * 0.16), upper / 2, 0], text: label, color: "#425b70" });
    }
    heightDimension(dimX, height, "H " + number.format(height) + " m");
    if (bottom > 0) {
      const face = left - section / 2;
      const topX = face - maxLength * top / bottom;
      const bottomX = face - maxLength;
      const points = load.perfil.map(point => [face-maxLength*point.total/bottom, height-point.z, 0]);
      const outline = [[face, 0, 0], ...points.slice().reverse(), [face, height, 0]];
      const surface = new T.BufferGeometry();
      surface.setAttribute("position", new T.Float32BufferAttribute(outline.flat(), 3));
      surface.setIndex(outline.slice(2).flatMap((_,i)=>[0,i+1,i+2]));
      group.add(new T.Mesh(surface, new T.MeshBasicMaterial({
        color: colors.soil, side: T.DoubleSide, transparent: true, opacity: 0.17
      })));
      line(group, [...outline, outline[0]], colors.soil);
      for (let i = 0; i <= 6; i++) {
        const ratio = i / 6;
        const depth = height * (1-ratio);
        const right = load.perfil.findIndex(point => point.z >= depth);
        const a = load.perfil[Math.max(0,right-1)], b = load.perfil[right];
        const value = a === b ? b.total : a.total + (b.total-a.total)*(depth-a.z)/(b.z-a.z);
        const x = face-maxLength*value/bottom;
        arrow(group, [x, height * ratio, section / 2], [face, height * ratio, section / 2], colors.soil, section * 1.2);
      }
      const start = face - maxLength * 1.55;
      arrow(group, [start, alturaAplicacao, section], [face, alturaAplicacao, section], 0x185c99, section * 1.8);
      const mark = dimX - Math.max(span * 0.15, height * 0.10);
      line(group, [[mark, 0, 0], [mark, alturaAplicacao, 0]], 0x185c99);
      for (const y of [0, alturaAplicacao]) line(group, [[mark - tick, y, 0], [mark + tick, y, 0]], 0x185c99);
      annotations.push(
        { point: [topX, height + labelGap, 0], text: "Topo " + number.format(top) + " kN/m²", color: "#8a381b" },
        { point: [bottomX, -labelGap, 0], text: "Base " + number.format(bottom) + " kN/m²", color: "#8a381b" },
        { point: [(start + face) / 2, alturaAplicacao + labelGap, section], text: "R = " + number.format(resultante) + " kN", color: "#185c99" },
        { point: [mark + Math.max(span * 0.15, height * 0.16), alturaAplicacao / 2, 0],
          text: "hᵣ " + number.format(alturaAplicacao) + " m", color: "#185c99" }
      );
    }
    return {
      center: [(dimX - span / 2 - maxLength * 1.45) / 2, height / 2, 0],
      extent: Math.max(height + 2 * labelGap, (span + maxLength * 1.55 + dimX - span / 2) * 0.71),
      annotations
    };
  }

  const projectHost = document.getElementById("projectThree");
  const forceHost = document.getElementById("forceThree");
  if (!T) {
    for (const host of [projectHost, forceHost]) host.textContent = "Visualização 3D indisponível.";
    return;
  }
  const projectView = viewport(projectHost, "Vista tridimensional esquemática do módulo", { azimuth: 0.48, elevation: 0.56, zoom: 1.25 });
  const forceView = viewport(forceHost, "Pórtico esquemático com distribuição e resultante do empuxo lateral", { azimuth: 0, elevation: 0, zoom: 1 });
  const selector = document.getElementById("projectThreeModule");
  const lid = document.getElementById("projectThreeLid");
  const dimensions = document.getElementById("projectThreeDims");
  const summary = document.getElementById("forceThreeSummary");
  const parameters = document.getElementById("forceThreeParams");
  const wallSelector = document.getElementById("forceWall");
  const wallHost = document.getElementById("forceWalls");
  let modules = {};
  let lastModule;
  let lastForces;
  let lastWallKey;
  let forceData;
  let walls;
  let scenarioKey;

  function renderScenarios(data){
    const key = JSON.stringify([lastWallKey,data.support,data.factor,data.resistance,data.extraQ]);
    if(key===scenarioKey) return;
    const scenarios = [
      { name:"Solo seco", waterDepth:null, extra:0 },
      { name:"Com lençol", waterDepth:data.waterDepth, extra:0, pending:data.waterDepth==null },
      { name:"Sobrecarga adicional", waterDepth:data.waterDepth, extra:data.extraQ, pending:data.extraQ==null }
    ];
    const rows = walls.flatMap(wall=>scenarios.map(scenario=>{
      const first = '<tr><th scope="row">'+wall.id+'</th><td>'+scenario.name+'</td>';
      if(scenario.pending) return first+'<td colspan="3">Dados pendentes</td></tr>';
      const load = window.DRE_CALC.calcularEmpuxo({ ...data, influence:1, waterDepth:scenario.waterDepth,
        surcharge:wall.surcharge+scenario.extra });
      const check = window.DRE_CALC.verificarFaixa(load,data.height,data.support,data.factor,data.resistance);
      const status = check.atendeV===false || check.atendeM===false ? "Não atende" :
        check.atendeV===null || check.atendeM===null ? "Dados pendentes" : "Atende";
      return first+'<td>'+number.format(check.v)+'</td><td>'+number.format(check.m)+'</td><td>'+status+'</td></tr>';
    })).join("");
    document.getElementById("wallScenarios").innerHTML = '<table><caption>Apoio: '
      +(data.support==="biapoiada"?"base e topo biapoiados":"base engastada e topo livre")
      +' · γf '+number.format(data.factor)+'</caption><thead><tr><th>Parede</th><th>Cenário</th><th>Vᵈ (kN/m)</th>'
      +'<th>Mᵈ (kN·m/m)</th><th>Verificação V/M</th></tr></thead><tbody>'+rows+'</tbody></table>';
    scenarioKey=key;
  }

  function wallDrawing(wall, height, scales){
    const width = 112 * wall.face / scales.face;
    const xWall = 72-width/2, yTop = 40, yBase = 156;
    let svg = '<svg viewBox="0 0 430 188" role="img" aria-label="Elevação e diagramas da parede '+wall.id+'">';
    svg += '<rect x="'+xWall+'" y="'+yTop+'" width="'+width+'" height="116" rx="1" fill="var(--surface-3)" stroke="var(--ink-soft)" stroke-width="1.5"/>';
    for(let row=1;row<7;row++){
      const y = yTop+row*116/7;
      svg += '<path d="M'+xWall+' '+y+'h'+width+'" stroke="var(--line-strong)" stroke-width=".65"/>';
    }
    svg += '<path d="M'+xWall+' 163v8m'+width+' -8v8M'+xWall+' 167h'+width+'" fill="none" stroke="var(--ink-faint)" stroke-width=".8"/>';
    svg += '<text x="72" y="183" text-anchor="middle" fill="var(--ink-soft)" font-size="10">'+number.format(wall.face)+' m</text>';
    svg += '<text x="72" y="23" text-anchor="middle" fill="var(--ink)" font-size="11">Elevação · H '+number.format(height)+' m</text>';
    const diagrams = [
      { key:"pressao", title:"Pressão", unit:"kN/m²", color:"#a74624" },
      { key:"cortante", title:"V / faixa", unit:"kN/m", color:"#226698" },
      { key:"momento", title:"M / faixa", unit:"kN·m/m", color:"#52645b" }
    ];
    diagrams.forEach((d,i)=>{
      const x = 148+i*93;
      const y = z => yTop+(yBase-yTop)*z/height;
      const coord = point => (x+66*point[d.key]/scales[d.key]).toFixed(1)+","+y(point.z).toFixed(1);
      const points = wall.diagramas.map(coord).join(" ");
      const end = wall.diagramas.at(-1)[d.key];
      svg += '<text x="'+(x+33)+'" y="23" text-anchor="middle" fill="var(--ink)" font-size="11">'+d.title+'</text>';
      svg += '<path d="M'+x+' '+yTop+'V'+yBase+'" stroke="var(--line-strong)" stroke-width=".8"/>';
      svg += '<polygon points="'+x+','+yTop+' '+points+' '+x+','+yBase+'" fill="'+d.color+'" fill-opacity=".18"/>';
      svg += '<polyline points="'+points+'" fill="none" stroke="'+d.color+'" stroke-width="1.5"/>';
      svg += '<text x="'+(x+33)+'" y="175" text-anchor="middle" fill="var(--ink-soft)" font-size="9">'+number.format(end)+' '+d.unit+'</text>';
    });
    return svg+'</svg>';
  }

  function updateWallDetail(){
    if (!forceData) return;
    const data = forceData;
    const { height, ka, soilWeight, clearance, influence, factor, moment, shear } = data;
    const wall = walls[Number(wallSelector.value)];
    const strip = Math.min(influence,wall.face);
    const load = window.DRE_CALC.calcularEmpuxo({ ...data, influence:strip, surcharge:wall.surcharge });
    const key = JSON.stringify([height,strip,load.perfil]);
    if (key !== lastForces){
      forceView.update(group => pressureScene(group, strip, height, load));
      lastForces = key;
    }
    const range = (a,b,unit) => number.format(a)+" → "+number.format(b)+" "+unit;
    const effort = (value,unit) => value == null ? "Aguardando valor do modelo" : number.format(factor*value)+" "+unit;
    parameters.textContent = wall.id+" · faixa "+number.format(strip)+" m · K "
      + new Intl.NumberFormat("pt-BR",{ maximumFractionDigits:4 }).format(ka)
      +" · γ "+number.format(soilWeight)+" kN/m³ · q "+number.format(wall.surcharge)
      +" kN/m² · folga "+number.format(clearance)+" m · γf "+number.format(factor)
      +(data.waterDepth == null ? " · sem água no cenário" : " · lençol a "+number.format(data.waterDepth)+" m do topo");
    summary.querySelector('[data-force="height"]').textContent = number.format(height)+" m";
    summary.querySelector('[data-force="pressure"]').textContent = range(load.topo,load.base,"kN/m²");
    summary.querySelector('[data-force="line"]').textContent = range(load.cargaTopo,load.cargaBase,"kN/m");
    summary.querySelector('[data-force="resultant"]').textContent = number.format(load.resultante)+" kN";
    summary.querySelector('[data-force="application"]').textContent = load.alturaAplicacao === null ? "—" : number.format(load.alturaAplicacao)+" m";
    summary.querySelector('[data-force="base-moment"]').textContent = number.format(load.momentoBase)+" kN·m";
    summary.querySelector('[data-force="moment"]').textContent = effort(moment,"kN·m");
    summary.querySelector('[data-force="shear"]').textContent = effort(shear,"kN");
  }

  function drawModule() {
    const module = modules[selector.value];
    if (!module) return;
    const key = JSON.stringify([module, lid.checked]);
    if (key === lastModule) return;
    projectView.update(group => moduleScene(group, module, lid.checked));
    dimensions.textContent = selector.selectedOptions[0].textContent + " · "
      + module.dims.map(dimension => number.format(dimension)).join(" × ") + " m (C × L × H)"
      + " · " + module.qty + (module.qty === 1 ? " unidade" : " unidades")
      + " · DN " + module.dn
      + (module.kind === "sumidouro" ? " · fundo aberto" : "");
    lastModule = key;
  }

  selector.addEventListener("change", drawModule);
  lid.addEventListener("change", drawModule);
  wallSelector.addEventListener("change",updateWallDetail);
  window.DREViews = {
    updateProject(next) {
      modules = next;
      const grease = selector.querySelector('[value="cg"]');
      grease.hidden = grease.disabled = !modules.cg;
      if (!modules[selector.value]) selector.value = "fossa";
      drawModule();
    },
    updateForces(data) {
      forceData = data;
      const { dimensions, height, surcharges, ka, soilWeight, surcharge, waterDepth, saturatedWeight } = data;
      const key = JSON.stringify([dimensions,height,surcharges,ka,soilWeight,surcharge,waterDepth,saturatedWeight]);
      if (key !== lastWallKey){
        walls = window.DRE_CALC.calcularParedesSumidouro(dimensions[0],dimensions[1],data,surcharges);
        const endpoints = walls.map(wall=>wall.diagramas.at(-1));
        const scales = {
          face:Math.max(...walls.map(wall=>wall.face)),
          pressao:Math.max(1,...endpoints.map(p=>p.pressao)),
          cortante:Math.max(1,...endpoints.map(p=>p.cortante)),
          momento:Math.max(1,...endpoints.map(p=>p.momento))
        };
        wallHost.innerHTML = walls.map((wall,i)=>'<article class="wall-card"><h3>'+wall.id
          +' · '+(i%2===0?"Parede longitudinal":"Parede transversal")+'</h3>'
          +'<p>q '+number.format(wall.surcharge)+' kN/m² · pressão no topo '+number.format(wall.topo)
          +' kN/m² · água na base '+number.format(wall.perfil.at(-1).agua)+' kN/m²</p>'
          +wallDrawing(wall,height,scales)+'<p>Resultante na parede: <b>'+number.format(wall.resultante)
          +' kN</b> · momento da carga em relação à base: <b>'+number.format(wall.momentoBase)+' kN·m</b></p></article>').join("");
        lastWallKey = key;
      }
      updateWallDetail();
      renderScenarios(data);
    }
  };
})();
