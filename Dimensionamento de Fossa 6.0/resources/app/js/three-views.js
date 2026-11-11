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

    box(group, [length, height, thickness], [0, height / 2, -(width - thickness) / 2], concrete);
    const endX = (length - thickness) / 2;
    box(group, [thickness, height, innerW], [-endX, height / 2, 0], concrete);
    if (closed) {
      box(group, [length, height, thickness], [0, height / 2, (width - thickness) / 2], concrete);
      box(group, [thickness, height, innerW], [endX, height / 2, 0], concrete);
    } else {
      box(group, [thickness, height, innerW * 0.62], [endX, height / 2, -innerW * 0.19], concrete);
    }

    if (!drain) box(group, [length, slab, width], [0, -slab / 2, 0], colors.steel).renderOrder = -1;
    if (closed) {
      box(group, [length, slab, width], [0, height + slab / 2, 0], colors.steel);
    } else if (drain) {
      for (let row = 0; row < 5; row++) {
        for (let column = 0; column < 9; column++) {
          const x = ((column + 0.5) / 9 - 0.5) * innerL;
          const y = (row + 0.5) * height / 5;
          box(group, [innerL / 26, height / 24, thickness / 12], [x, y, -width / 2 + thickness * 1.01], 0x665746);
        }
      }
    } else {
      const mediaHeight = height * (kind === "filtro" ? 0.54 : 0.16);
      const color = kind === "filtro" ? 0x6d998e : colors.liquid;
      box(group, [innerL * 0.98, mediaHeight, innerW * 0.96], [0, mediaHeight / 2, 0], color);
      if (kind === "cg" || (kind === "fossa" && length >= 2 * width)) {
        const x = innerL * (kind === "cg" ? 0.05 : 1 / 6);
        box(group, [thickness, height * 0.72, innerW], [x, height * 0.5, 0], colors.steel);
      }
    }

    const stub = Math.min(length * 0.32, Math.max(0.35, width * 0.38));
    for (const side of drain ? [-1] : [-1, 1]) {
      const y = height * (kind === "filtro" && side < 0 ? 0.19 : 0.76);
      const color = side === -1 ? 0x21847b : 0xaf6229;
      const pipe = new T.Mesh(new T.CylinderGeometry(dn / 2000, dn / 2000, stub, 12),
        new T.MeshLambertMaterial({ color }));
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
      const outline = [[face, 0, 0], [bottomX, 0, 0], [topX, height, 0], [face, height, 0]];
      const surface = new T.BufferGeometry();
      surface.setAttribute("position", new T.Float32BufferAttribute(outline.flat(), 3));
      surface.setIndex([0, 1, 2, 0, 2, 3]);
      group.add(new T.Mesh(surface, new T.MeshBasicMaterial({
        color: colors.soil, side: T.DoubleSide, transparent: true, opacity: 0.17
      })));
      line(group, [...outline, outline[0]], colors.soil);
      for (let i = 0; i <= 6; i++) {
        const ratio = i / 6;
        const x = bottomX + (topX - bottomX) * ratio;
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
  let modules = {};
  let lastModule;
  let lastForces;

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
  window.DREViews = {
    updateProject(next) {
      modules = next;
      const grease = selector.querySelector('[value="cg"]');
      grease.hidden = grease.disabled = !modules.cg;
      if (!modules[selector.value]) selector.value = "fossa";
      drawModule();
    },
    updateForces(data) {
      const { height, ka, soilWeight, surcharge, clearance, influence, factor, moment, shear } = data;
      const load = window.DRE_CALC.calcularEmpuxo(data);
      const key = JSON.stringify([height, influence, load.topo, load.base]);
      if (key !== lastForces) {
        forceView.update(group => pressureScene(group, influence, height, load));
        lastForces = key;
      }
      const range = (a, b, unit) => number.format(a) + " → " + number.format(b) + " " + unit;
      const effort = (value, unit) => value == null ? "Aguardando valor do modelo" : number.format(factor * value) + " " + unit;
      parameters.textContent = "Kₐ " + new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(ka)
        + " · γ " + number.format(soilWeight) + " kN/m³ · q " + number.format(surcharge)
        + " kN/m² · folga " + number.format(clearance) + " m · faixa " + number.format(influence)
        + " m · γf " + number.format(factor);
      summary.querySelector('[data-force="height"]').textContent = number.format(height) + " m";
      summary.querySelector('[data-force="pressure"]').textContent = range(load.topo, load.base, "kN/m²");
      summary.querySelector('[data-force="line"]').textContent = range(load.cargaTopo, load.cargaBase, "kN/m");
      summary.querySelector('[data-force="resultant"]').textContent = number.format(load.resultante) + " kN";
      summary.querySelector('[data-force="application"]').textContent =
        load.alturaAplicacao === null ? "—" : number.format(load.alturaAplicacao) + " m";
      summary.querySelector('[data-force="base-moment"]').textContent = number.format(load.momentoBase) + " kN·m";
      summary.querySelector('[data-force="moment"]').textContent = effort(moment, "kN·m");
      summary.querySelector('[data-force="shear"]').textContent = effort(shear, "kN");
    }
  };
})();
