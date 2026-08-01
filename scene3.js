import { drawAnnotation } from './annotation.js';

const PCA_URL = 'data/pca_data.json';
const TRAJECTORIES_URL = 'data/trajectories.json';

const MOLECULE_COLORS = [
  '#2F6F8F', // blue
  '#D8912F', // amber
  '#A5457A', // magenta
  '#4F8F5B', // green
  '#7A5FA8', // violet
  '#B85C38', // rust
];

let resizeObserver = null;

function fmt(n, digits = 2) {
  if (n === null || n === undefined) return '—';
  return typeof n === 'number' ? n.toFixed(digits) : n;
}

function buildDom(container) {
  container.innerHTML = `
    <div class="scene" id="scene3">
      <div class="scene__viz" id="s3-viz">
        <svg id="s3-svg" width="100%" height="100%"></svg>
        <div class="viz-tooltip" id="s3-tooltip"></div>
      </div>
      <aside class="scene__panel">
        <div>
          <div class="scene__eyebrow">Scene 03 · Paired concentrations</div>
          <h1 class="scene__title">Movement in Odor Space</h1>
          <p class="scene__desc">
            Of the 160 stimuli, only 6 molecules were rated at both a low and
            a high concentration. Each arrow traces how that molecule's
            position in perceptual space shifts as concentration rises.
          </p>
        </div>

        <div class="panel-block">
          <p class="panel-block__label">Molecules</p>
          <div class="legend-list" id="s3-legend"></div>
        </div>

        <div class="panel-block">
          <p class="panel-block__label">Reading</p>
          <p class="scene__desc" style="margin:0 0 8px;">
            Click any molecule — on the plot or in the list — to open its
            full descriptor profile and slide through concentration.
          </p>
          <div class="readout" id="s3-readout">
            <p class="readout-empty">Hover or click a point to inspect it.</p>
          </div>
        </div>
      </aside>
    </div>
  `;
}

function init(container, { onNext, onPrev, onSelectMolecule } = {}) {
  if (typeof d3 === 'undefined') {
    throw new Error('d3 not loaded');
  }

  buildDom(container);

  const vizEl = container.querySelector('#s3-viz');
  const svg = d3.select(container.querySelector('#s3-svg'));
  const tooltipEl = container.querySelector('#s3-tooltip');
  const readoutEl = container.querySelector('#s3-readout');
  const legendEl = container.querySelector('#s3-legend');

  let molecules = []; // [{ name, cas, cid, color, low, high }]
  let radiusScale = null;
  let selectedCid = null;

  const defs = svg.append('defs');

  const gAxes = svg.append('g').attr('class', 'layer-axes');
  const gArrows = svg.append('g').attr('class', 'layer-arrows');
  const gPoints = svg.append('g').attr('class', 'layer-points');
  const gAnnotations = svg.append('g').attr('class', 'layer-annotations');

  function selectMolecule(m) {
    selectedCid = m.cid;
    renderReadout(m);
    highlightSelection();
    if (typeof onSelectMolecule === 'function') {
      onSelectMolecule({ cid: m.cid, name: m.name, cas: m.cas });
    }
  }

  function highlightSelection() {
    gPoints.selectAll('circle.pca-point')
      .classed('is-selected', (d) => d.molecule.cid === selectedCid);
    gArrows.selectAll('line.molecule-arrow')
      .classed('is-selected', (d) => d.cid === selectedCid);
    [...legendEl.children].forEach((row) => {
      row.classList.toggle('is-selected', Number(row.dataset.cid) === selectedCid);
    });
  }

  function renderReadout(pointOrMolecule) {
    if (!pointOrMolecule) {
      readoutEl.innerHTML = '<p class="readout-empty">Hover or click a point to inspect it.</p>';
      return;
    }
    const isPoint = pointOrMolecule.point !== undefined;
    const m = isPoint ? pointOrMolecule.molecule : pointOrMolecule;
    const p = isPoint ? pointOrMolecule.point : null;
    readoutEl.innerHTML = `
      <div class="readout__name">${m.name}</div>
      <div class="readout__row"><span>CAS</span><span>${m.cas || '—'}</span></div>
      ${p ? `<div class="readout__row"><span>Concentration</span><span>${p.concentration}</span></div>
      <div class="readout__row"><span>PC1, PC2</span><span>${fmt(p.pc1)}, ${fmt(p.pc2)}</span></div>` : ''}
      <div class="readout__row"><span>Low → High shift</span><span>${fmt(m.shiftMagnitude)}</span></div>
    `;
  }

  function moveTooltip(event, label) {
    const vizRect = vizEl.getBoundingClientRect();
    const x = event.clientX - vizRect.left;
    const y = event.clientY - vizRect.top;
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
    if (label !== undefined) {
      tooltipEl.style.opacity = 1;
      tooltipEl.innerHTML = label;
    }
  }

  function hideTooltip() {
    tooltipEl.style.opacity = 0;
  }

  function buildLegend() {
    legendEl.innerHTML = molecules.map((m) => `
      <div class="legend-swatch-row legend-swatch-row--clickable" data-cid="${m.cid}">
        <span class="legend-swatch" style="background:${m.color}"></span>
        <span>${m.name}</span>
      </div>
    `).join('');

    [...legendEl.children].forEach((row, i) => {
      row.addEventListener('click', () => selectMolecule(molecules[i]));
      row.addEventListener('mouseenter', () => renderReadout(molecules[i]));
      row.addEventListener('mouseleave', () => {
        const selected = selectedCid ? molecules.find((m) => m.cid === selectedCid) : null;
        renderReadout(selected);
      });
    });
  }

  function render() {
    if (!molecules.length) return;

    const width = vizEl.clientWidth;
    const height = vizEl.clientHeight;
    const margin = { top: 28, right: 28, bottom: 44, left: 52 };
    const innerW = Math.max(10, width - margin.left - margin.right);
    const innerH = Math.max(10, height - margin.top - margin.bottom);

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const allPoints = molecules.flatMap((m) => [m.low, m.high]);
    const pc1Extent = d3.extent(allPoints, (d) => d.pc1);
    const pc2Extent = d3.extent(allPoints, (d) => d.pc2);
    const padX = (pc1Extent[1] - pc1Extent[0]) * 0.18 || 1;
    const padY = (pc2Extent[1] - pc2Extent[0]) * 0.18 || 1;

    const x = d3.scaleLinear()
      .domain([pc1Extent[0] - padX, pc1Extent[1] + padX])
      .range([0, innerW]);
    const y = d3.scaleLinear()
      .domain([pc2Extent[0] - padY, pc2Extent[1] + padY])
      .range([innerH, 0]);

    if (!radiusScale) {
      const intensityExtent = d3.extent(allPoints, (d) => d.mean_intensity);
      radiusScale = d3.scaleSqrt().domain(intensityExtent).range([4, 13]);
    }

    gAxes.attr('transform', `translate(${margin.left},${margin.top})`);
    gAxes.selectAll('*').remove();

    gAxes.append('g')
      .attr('class', 'axis axis--x')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(4));

    gAxes.append('g')
      .attr('class', 'axis axis--y')
      .call(d3.axisLeft(y).ticks(6).tickSize(4));

    gAxes.append('line')
      .attr('x1', x(0)).attr('x2', x(0))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', 'var(--line)').attr('stroke-dasharray', '2,3');
    gAxes.append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', y(0)).attr('y2', y(0))
      .attr('stroke', 'var(--line)').attr('stroke-dasharray', '2,3');

    gAxes.append('text')
      .attr('class', 'axis-label')
      .attr('x', innerW / 2).attr('y', innerH + 36)
      .attr('text-anchor', 'middle')
      .text('PC1');

    gAxes.append('text')
      .attr('class', 'axis-label')
      .attr('transform', `translate(${-38},${innerH / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('PC2');

    // per-molecule arrowhead markers, colored to match
    defs.selectAll('marker.arrowhead')
      .data(molecules, (d) => d.cid)
      .join('marker')
      .attr('class', 'arrowhead')
      .attr('id', (d) => `arrow-${d.cid}`)
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 8)
      .attr('refY', 5)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M0,0 L10,5 L0,10 Z')
      .attr('fill', (d) => d.color);

    gArrows.attr('transform', `translate(${margin.left},${margin.top})`);

    const arrows = gArrows.selectAll('line.molecule-arrow')
      .data(molecules, (d) => d.cid);

    arrows.enter()
      .append('line')
      .attr('class', 'molecule-arrow')
      .merge(arrows)
      .attr('x1', (d) => x(d.low.pc1))
      .attr('y1', (d) => y(d.low.pc2))
      .attr('x2', (d) => x(d.high.pc1))
      .attr('y2', (d) => y(d.high.pc2))
      .attr('stroke', (d) => d.color)
      .attr('marker-end', (d) => `url(#arrow-${d.cid})`)
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => moveTooltip(event, `${d.name} <span style="opacity:.6">low → high</span>`))
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', hideTooltip)
      .on('click', (event, d) => selectMolecule(d));

    gPoints.attr('transform', `translate(${margin.left},${margin.top})`);

    const pointData = molecules.flatMap((m) => ([
      { point: m.low, molecule: m, isHigh: false },
      { point: m.high, molecule: m, isHigh: true },
    ]));

    const circles = gPoints.selectAll('circle.pca-point')
      .data(pointData, (d) => d.point.stimulus);

    circles.exit().remove();

    const circlesEnter = circles.enter()
      .append('circle')
      .attr('class', 'pca-point');

    circlesEnter.merge(circles)
      .attr('cx', (d) => x(d.point.pc1))
      .attr('cy', (d) => y(d.point.pc2))
      .attr('r', (d) => radiusScale(d.point.mean_intensity))
      .attr('fill', (d) => (d.isHigh ? d.molecule.color : 'var(--bg)'))
      .attr('stroke', (d) => d.molecule.color)
      .attr('stroke-width', (d) => (d.isHigh ? 1 : 2))
      .classed('is-selected', (d) => d.molecule.cid === selectedCid)
      .on('mouseenter', (event, d) => {
        renderReadout(d);
        moveTooltip(event, `${d.molecule.name} <span style="opacity:.6">(${d.point.concentration})</span>`);
      })
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', () => {
        hideTooltip();
        const selected = selectedCid ? molecules.find((m) => m.cid === selectedCid) : null;
        renderReadout(selected);
      })
      .on('click', (event, d) => selectMolecule(d.molecule));

    // molecule name labels near the high point
    const labels = gPoints.selectAll('text.molecule-label')
      .data(molecules, (d) => d.cid);

    labels.enter()
      .append('text')
      .attr('class', 'molecule-label')
      .merge(labels)
      .attr('x', (d) => x(d.high.pc1) + 10)
      .attr('y', (d) => y(d.high.pc2) + 4)
      .attr('fill', (d) => d.color)
      .text((d) => d.name);

    // Built-in annotation: always surface the molecule whose low→high shift
    // is largest, since that's this scene's central claim.
    gAnnotations.attr('transform', `translate(${margin.left},${margin.top})`);
    const focus = molecules.reduce(
      (best, m) => (!best || (m.shiftMagnitude ?? 0) > (best.shiftMagnitude ?? 0) ? m : best),
      null
    );
    if (focus) {
      const hx = x(focus.high.pc1);
      const hy = y(focus.high.pc2);
      drawAnnotation(gAnnotations, {
        x: hx,
        y: hy,
        dx: hx > innerW / 2 ? -196 : 22,
        dy: hy > innerH / 2 ? -84 : 22,
        title: 'Largest perceptual shift',
        text: [focus.name, `shift magnitude ${fmt(focus.shiftMagnitude)}`],
      });
    }
  }

  Promise.all([
    fetch(PCA_URL).then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${PCA_URL}: ${res.status}`);
      return res.json();
    }),
    fetch(TRAJECTORIES_URL).then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${TRAJECTORIES_URL}: ${res.status}`);
      return res.json();
    }),
  ])
    .then(([pca, trajectories]) => {
      const pointsByStimulus = new Map(pca.points.map((p) => [p.stimulus, p]));

      molecules = trajectories.molecules.map((m, i) => {
        const low = pointsByStimulus.get(m.low_stimulus);
        const high = pointsByStimulus.get(m.high_stimulus);
        const shiftMagnitude = low && high
          ? Math.sqrt((high.pc1 - low.pc1) ** 2 + (high.pc2 - low.pc2) ** 2)
          : null;
        return {
          name: m.name,
          cas: m.cas,
          cid: m.cid,
          color: MOLECULE_COLORS[i % MOLECULE_COLORS.length],
          low,
          high,
          shiftMagnitude,
        };
      }).filter((m) => m.low && m.high);

      buildLegend();
      render();
    })
    .catch((err) => {
      vizEl.innerHTML = `<div class="placeholder-scene"><h2>Couldn't load data</h2><p>${err.message}</p></div>`;
      console.error(err);
    });

  resizeObserver = new ResizeObserver(() => render());
  resizeObserver.observe(vizEl);
}

function destroy() {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
}

export default { id: 'scene3', init, destroy };