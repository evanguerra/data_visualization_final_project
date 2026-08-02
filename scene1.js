import { drawAnnotation } from './annotation.js';

const DATA_URL = 'data/pca_data.json';

let resizeObserver = null;
let tooltipEl = null;

function fmt(n, digits = 2) {
  if (n === null || n === undefined) return '—';
  return typeof n === 'number' ? n.toFixed(digits) : n;
}

function buildDom(container) {
  container.innerHTML = `
    <div class="scene" id="scene1">
      <div class="scene__intro">
        <div class="scene__intro-text">
          <div class="scene__eyebrow">Scene 01 · Perceptual map</div>
          <h1 class="scene__title">Odor Space</h1>
          <p class="scene__desc">
            160 stimuli, each rated by panelists across 146 odor descriptors,
            reduced to two dimensions. Nearby points smell similar overall —
            not on any single note, but across the whole descriptor profile.
          </p>
        </div>
      </div>

      <div class="scene__body">
        <div class="scene__viz" id="s1-viz">
          <svg id="s1-svg" width="100%" height="100%"></svg>
          <div class="viz-tooltip" id="s1-tooltip"></div>
        </div>
        <aside class="scene__controls">
          <div class="scene__reading">
            <p class="panel-block__label">Reading</p>
            <div class="readout" id="s1-readout">
              <p class="readout-empty">Hover or click a point to inspect it.</p>
            </div>
          </div>

          <div class="panel-block">
            <p class="panel-block__label">Color · Molecular weight</p>
            <div class="legend-scale" id="s1-legend-gradient"></div>
            <div class="legend-scale-labels" id="s1-legend-labels">
              <span>—</span><span>—</span>
            </div>
            <div class="legend-swatch-row">
              <span class="legend-swatch" style="background:var(--accent-magenta)"></span>
              <span>Mixture / no single CID</span>
            </div>
          </div>

          <div class="panel-block">
            <p class="panel-block__label">Size · Mean rated intensity</p>
            <p class="scene__desc" style="margin:0; max-width:none;">
              Larger points were rated more strongly, on average, across all descriptors.
            </p>
          </div>
        </aside>
      </div>
    </div>
  `;
}

function init(container, { onNext, onPrev } = {}) {
  if (typeof d3 === 'undefined') {
    throw new Error('d3 is not loaded — check that assets/d3.min.js is present and loads before main.js');
  }

  buildDom(container);

  const vizEl = container.querySelector('#s1-viz');
  const svg = d3.select(container.querySelector('#s1-svg'));
  tooltipEl = container.querySelector('#s1-tooltip');
  const readoutEl = container.querySelector('#s1-readout');
  const legendGradient = container.querySelector('#s1-legend-gradient');
  const legendLabels = container.querySelector('#s1-legend-labels');

  let selectedId = null;
  let data = null;
  let colorScale = null;
  let radiusScale = null;

  const gAxes = svg.append('g').attr('class', 'layer-axes');
  const gPoints = svg.append('g').attr('class', 'layer-points');
  const gAnnotations = svg.append('g').attr('class', 'layer-annotations');

  function renderReadout(point) {
    if (!point) {
      readoutEl.innerHTML = '<p class="readout-empty">Hover or click a point to inspect it.</p>';
      return;
    }
    readoutEl.innerHTML = `
      <div class="readout__name">${point.name || point.stimulus}</div>
      <div class="readout__row"><span>Concentration</span><span>${point.concentration || '—'}</span></div>
      <div class="readout__row"><span>CAS</span><span>${point.cas || '—'}</span></div>
      <div class="readout__row"><span>Mol. weight</span><span>${point.molecular_weight ? fmt(point.molecular_weight, 1) + ' g/mol' : '—'}</span></div>
      <div class="readout__row"><span>Mean intensity</span><span>${fmt(point.mean_intensity)}</span></div>
      <div class="readout__row"><span>Top descriptor</span><span>${point.top_descriptor}</span></div>
      <div class="readout__row"><span>PC1, PC2</span><span>${fmt(point.pc1)}, ${fmt(point.pc2)}</span></div>
    `;
  }

  function moveTooltip(event, point) {
    const vizRect = vizEl.getBoundingClientRect();
    const x = event.clientX - vizRect.left;
    const y = event.clientY - vizRect.top;
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
    tooltipEl.style.opacity = 1;
    tooltipEl.innerHTML = `${point.name || point.stimulus}${point.concentration ? ` <span style="opacity:.6">· ${point.concentration} concentration</span>` : ''}`;
  }

  function hideTooltip() {
    tooltipEl.style.opacity = 0;
  }

  function render() {
    if (!data) return;

    const width = vizEl.clientWidth;
    const height = vizEl.clientHeight;
    const margin = { top: 28, right: 28, bottom: 44, left: 52 };
    const innerW = Math.max(10, width - margin.left - margin.right);
    const innerH = Math.max(10, height - margin.top - margin.bottom);

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const pc1Extent = d3.extent(data.points, (d) => d.pc1);
    const pc2Extent = d3.extent(data.points, (d) => d.pc2);
    const padX = (pc1Extent[1] - pc1Extent[0]) * 0.08;
    const padY = (pc2Extent[1] - pc2Extent[0]) * 0.08;

    const x = d3.scaleLinear()
      .domain([pc1Extent[0] - padX, pc1Extent[1] + padX])
      .range([0, innerW]);
    const y = d3.scaleLinear()
      .domain([pc2Extent[0] - padY, pc2Extent[1] + padY])
      .range([innerH, 0]);

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

    const xLabel = gAxes.append('text')
      .attr('class', 'axis-pole-label')
      .attr('text-anchor', 'middle')
      .attr('x', innerW / 2).attr('y', innerH + 36);
    xLabel.append('tspan').text('sickening, wet wool');
    xLabel.append('tspan').attr('class', 'axis-pole-arrow').attr('dx', 8).text('⟵   ⟶');
    xLabel.append('tspan').attr('dx', 8).text('fragrant, light');

    const yLabel = gAxes.append('text')
      .attr('class', 'axis-pole-label')
      .attr('text-anchor', 'middle')
      .attr('transform', `translate(${-38},${innerH / 2}) rotate(-90)`);
    yLabel.append('tspan').text('putrid, sweet');
    yLabel.append('tspan').attr('class', 'axis-pole-arrow').attr('dx', 8).text('⟵   ⟶');
    yLabel.append('tspan').attr('dx', 8).text('aromatic, stale');

    gPoints.attr('transform', `translate(${margin.left},${margin.top})`);

    const circles = gPoints.selectAll('circle.pca-point')
      .data(data.points, (d) => d.stimulus);

    circles.exit().remove();

    const circlesEnter = circles.enter()
      .append('circle')
      .attr('class', 'pca-point');

    circlesEnter.merge(circles)
      .attr('cx', (d) => x(d.pc1))
      .attr('cy', (d) => y(d.pc2))
      .attr('r', (d) => radiusScale(d.mean_intensity))
      .attr('fill', (d) => (d.has_molecule_record ? colorScale(d.molecular_weight) : 'var(--accent-magenta)'))
      .classed('is-selected', (d) => d.stimulus === selectedId)
      .on('mouseenter', (event, d) => {
        renderReadout(d);
        moveTooltip(event, d);
      })
      .on('mousemove', (event, d) => moveTooltip(event, d))
      .on('mouseleave', () => {
        hideTooltip();
        const selected = selectedId ? data.points.find((p) => p.stimulus === selectedId) : null;
        renderReadout(selected);
      })
      .on('click', (event, d) => {
        selectedId = selectedId === d.stimulus ? null : d.stimulus;
        gPoints.selectAll('circle.pca-point').classed('is-selected', (p) => p.stimulus === selectedId);
        renderReadout(selectedId ? d : null);
      });

    // Built-in annotation (parameter-driven, not a hover effect): always
    // point out the single most intense stimulus in the atlas so the
    // narrative point — "size encodes intensity" — lands immediately.
    gAnnotations.attr('transform', `translate(${margin.left},${margin.top})`);
    const focus = data.points.reduce(
      (best, d) => (!best || d.mean_intensity > best.mean_intensity ? d : best),
      null
    );
    if (focus) {
      const fx = x(focus.pc1);
      const fy = y(focus.pc2);
      drawAnnotation(gAnnotations, {
        x: fx,
        y: fy,
        dx: fx > innerW / 2 ? -196 : 22,
        dy: fy > innerH / 2 ? -76 : 22,
        title: 'Most intense stimulus',
        text: [
          focus.name || focus.stimulus,
          `Mean intensity ${fmt(focus.mean_intensity)}`,
        ],
      });
    }
  }

  function setupScales() {
    const mwExtent = d3.extent(data.points.filter((d) => d.molecular_weight != null), (d) => d.molecular_weight);
    colorScale = d3.scaleSequential()
      .domain(mwExtent)
      .interpolator(d3.interpolateRgb('#2F6F8F', '#D8912F'));

    const intensityExtent = d3.extent(data.points, (d) => d.mean_intensity);
    radiusScale = d3.scaleSqrt().domain(intensityExtent).range([3, 11]);

    legendGradient.style.background = `linear-gradient(90deg, ${colorScale(mwExtent[0])}, ${colorScale(mwExtent[1])})`;
    legendLabels.innerHTML = `<span>${Math.round(mwExtent[0])} g/mol</span><span>${Math.round(mwExtent[1])} g/mol</span>`;
  }

  fetch(DATA_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
      return res.json();
    })
    .then((json) => {
      data = json;
      setupScales();
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

export default { id: 'scene1', init, destroy };