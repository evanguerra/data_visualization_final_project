import { drawAnnotation } from './annotation.js';

const DATA_URL = 'data/trajectories.json';
const N_BARS_SHOWN = 14;

const CATEGORY_LABELS = {
  grows: 'Grows low → high',
  emergent: 'Emergent (near-zero at low)',
  shrinks: 'Shrinks low → high',
  fading: 'Fading (near-zero at high)',
  flat: 'Flat',
};

let resizeObserver = null;
let tooltipEls = {};

function fmt(n, digits = 1) {
  if (n === null || n === undefined) return '—';
  return typeof n === 'number' ? n.toFixed(digits) : n;
}

function buildDom(container) {
  container.innerHTML = `
    <div class="scene" id="scene2">
      <div class="scene__intro">
        <div class="scene__intro-text">
          <div class="scene__eyebrow">Scene 02 · Descriptor profiles</div>
          <h1 class="scene__title">Top Descriptors</h1>
          <p class="scene__desc">
            The ${N_BARS_SHOWN} highest-rated descriptors for each molecule at
            low concentration. Smell isn't static — the same molecule can
            read very differently depending on how much of it you're
            smelling. Drag the slider to watch which descriptors survive,
            emerge, or fade as concentration rises.
          </p>
        </div>
      </div>

      <div class="scene__body">
        <div class="scene__viz scene__viz--stack" id="s2-viz">
          <div class="bar-chart-row">
            <div class="bar-chart-row__title" id="s2-title-a"></div>
            <div class="bar-chart-row__body">
              <svg id="s2-svg-a" width="100%" height="100%"></svg>
            </div>
          </div>
          <div class="bar-chart-row">
            <div class="bar-chart-row__title" id="s2-title-b"></div>
            <div class="bar-chart-row__body">
              <svg id="s2-svg-b" width="100%" height="100%"></svg>
            </div>
          </div>
          <div class="viz-tooltip" id="s2-tooltip"></div>
        </div>
        <aside class="scene__controls">
          <div class="scene__reading">
            <p class="panel-block__label">Reading</p>
            <div class="readout" id="s2-readout">
              <p class="readout-empty">Hover or click a bar to inspect it.</p>
            </div>
          </div>

          <div class="panel-block">
            <p class="panel-block__label" id="s2-slider-label">Concentration: Low (step 1 / 6)</p>
            <input type="range" id="s2-conc-slider" class="conc-slider" min="0" max="5" step="1" value="0" />
            <div class="legend-scale-labels">
              <span>Low</span><span>High</span>
            </div>
          </div>

          <div class="panel-block">
            <p class="panel-block__label">Color · Change from low to high</p>
            <div class="legend-scale" style="background: linear-gradient(90deg, #1F5578, #DCE9F2, #F5E4C7, #B9701E);"></div>
            <div class="legend-scale-labels">
              <span>Shrinks a lot</span><span>Little change</span><span>Grows a lot</span>
            </div>
            <div class="legend-swatch-row">
              <span class="legend-swatch" style="background:var(--accent-magenta)"></span>
              <span>Emergent (near-zero at low)</span>
            </div>
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

  const vizEl = container.querySelector('#s2-viz');
  const svgA = d3.select(container.querySelector('#s2-svg-a'));
  const svgB = d3.select(container.querySelector('#s2-svg-b'));
  const titleA = container.querySelector('#s2-title-a');
  const titleB = container.querySelector('#s2-title-b');
  const tooltipEl = container.querySelector('#s2-tooltip');
  const readoutEl = container.querySelector('#s2-readout');
  const slider = container.querySelector('#s2-conc-slider');
  const sliderLabel = container.querySelector('#s2-slider-label');

  tooltipEls = { el: tooltipEl };

  // Bar color encodes how much a descriptor's rating changes from low to
  // high concentration (a gradient), not just whether it grows or shrinks.
  // "Emergent" descriptors are still always pink — that's a distinct,
  // notable pattern worth calling out on its own regardless of magnitude.
  const growColorScale = d3.interpolateRgb('#F5E4C7', '#B9701E');
  const shrinkColorScale = d3.interpolateRgb('#DCE9F2', '#1F5578');
  let maxAbsDelta = 1;

  function changeColor(delta) {
    const t = Math.min(1, Math.abs(delta) / maxAbsDelta);
    return delta >= 0 ? growColorScale(t) : shrinkColorScale(t);
  }

  let data = null;
  let molecules = [];
  let stepIndex = 0; // 0..5, index into molecule.steps
  let selected = null; // { moleculeName, descriptor }
  // Which descriptors are shown per molecule is fixed at the low-concentration
  // top N, so bars stay in place and only their heights move as you slide.
  const fixedDescriptors = new Map(); // moleculeName -> [descriptor, ...]

  slider.addEventListener('input', () => {
    stepIndex = Number(slider.value);
    updateSliderLabel();
    render();
  });

  function updateSliderLabel() {
    const step = molecules[0] ? molecules[0].steps[stepIndex] : null;
    const stepLabel = step ? step.label : '';
    sliderLabel.textContent = `Concentration: ${stepLabel} (step ${stepIndex + 1} / 6)`;
  }

  function descriptorsFor(molecule) {
    if (!fixedDescriptors.has(molecule.name)) {
      const lowStep = molecule.steps[0];
      const top = Object.entries(lowStep.values)
        .sort((a, b) => b[1] - a[1])
        .slice(0, N_BARS_SHOWN)
        .map(([descriptor]) => descriptor);
      fixedDescriptors.set(molecule.name, top);
    }
    return fixedDescriptors.get(molecule.name);
  }

  function entriesFor(molecule) {
    const step = molecule.steps[stepIndex];
    const lowStep = molecule.steps[0];
    const highStep = molecule.steps[molecule.steps.length - 1];
    const descriptors = descriptorsFor(molecule);
    return descriptors.map((descriptor) => ({
      descriptor,
      value: step.values[descriptor],
      lowValue: lowStep.values[descriptor],
      highValue: highStep.values[descriptor],
      delta: (highStep.values[descriptor] ?? 0) - (lowStep.values[descriptor] ?? 0),
      category: molecule.descriptor_categories[descriptor] || 'flat',
    }));
  }

  function renderReadout(entry, molecule) {
    if (!entry) {
      readoutEl.innerHTML = '<p class="readout-empty">Hover or click a bar to inspect it.</p>';
      return;
    }
    readoutEl.innerHTML = `
      <div class="readout__name">${entry.descriptor}</div>
      <div class="readout__row"><span>Molecule</span><span>${molecule.name}</span></div>
      <div class="readout__row"><span>Rating (${molecule.steps[stepIndex].label})</span><span>${fmt(entry.value)}</span></div>
      <div class="readout__row"><span>Change (low → high)</span><span>${fmt(entry.lowValue)} → ${fmt(entry.highValue)}</span></div>
      <div class="readout__row"><span>Trajectory</span><span>${CATEGORY_LABELS[entry.category] || entry.category}</span></div>
    `;
  }

  function moveTooltip(event, entry) {
    const vizRect = vizEl.getBoundingClientRect();
    const x = event.clientX - vizRect.left;
    const y = event.clientY - vizRect.top;
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
    tooltipEl.style.opacity = 1;
    tooltipEl.innerHTML = `${entry.descriptor} <span style="opacity:.6">${fmt(entry.value)}</span>`;
  }

  function hideTooltip() {
    tooltipEl.style.opacity = 0;
  }

  function renderChart(svg, molecule) {
    const svgNode = svg.node();
    const colEl = svgNode.parentElement;
    const width = colEl.clientWidth;
    const height = colEl.clientHeight;
    const margin = { top: 10, right: 20, bottom: 82, left: 52 };
    const innerW = Math.max(10, width - margin.left - margin.right);
    const innerH = Math.max(10, height - margin.top - margin.bottom);

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const entries = entriesFor(molecule);

    const x = d3.scaleBand()
      .domain(entries.map((d) => d.descriptor))
      .range([0, innerW])
      .padding(0.28);

    const maxVal = d3.max(entries, (d) => d.value) || 1;
    const y = d3.scaleLinear()
      .domain([0, maxVal * 1.12])
      .range([innerH, 0]);

    let g = svg.select('g.chart-root');
    if (g.empty()) {
      g = svg.append('g').attr('class', 'chart-root');
      g.append('g').attr('class', 'layer-axis-y');
      g.append('g').attr('class', 'layer-axis-x');
      g.append('g').attr('class', 'layer-bars');
    }
    g.attr('transform', `translate(${margin.left},${margin.top})`);

    g.select('.layer-axis-y')
      .transition().duration(300)
      .call(d3.axisLeft(y).ticks(5).tickSize(4));

    g.select('.layer-axis-x')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSize(4))
      .selectAll('text')
      .attr('transform', 'rotate(-35)')
      .attr('text-anchor', 'end')
      .attr('dx', '-0.4em')
      .attr('dy', '0.4em')
      .text((d) => (d.length > 22 ? d.slice(0, 21) + '…' : d));

    const bars = g.select('.layer-bars')
      .selectAll('rect.bar')
      .data(entries, (d) => d.descriptor);

    bars.exit()
      .transition().duration(200)
      .attr('y', innerH).attr('height', 0)
      .remove();

    const barsEnter = bars.enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.descriptor))
      .attr('width', x.bandwidth())
      .attr('y', innerH)
      .attr('height', 0);

    barsEnter.merge(bars)
      .attr('fill', (d) => (d.category === 'emergent' ? 'var(--accent-magenta)' : changeColor(d.delta)))
      .classed('is-selected', (d) => selected && selected.moleculeName === molecule.name && selected.descriptor === d.descriptor)
      .on('mouseenter', (event, d) => {
        renderReadout(d, molecule);
        moveTooltip(event, d);
      })
      .on('mousemove', (event, d) => moveTooltip(event, d))
      .on('mouseleave', () => {
        hideTooltip();
        renderReadout(selected ? selected.entry : null, selected ? selected.molecule : null);
      })
      .on('click', (event, d) => {
        if (selected && selected.moleculeName === molecule.name && selected.descriptor === d.descriptor) {
          selected = null;
          renderReadout(null);
        } else {
          selected = { moleculeName: molecule.name, descriptor: d.descriptor, entry: d, molecule };
          renderReadout(d, molecule);
        }
        renderAll();
      })
      .transition().duration(300)
      .attr('x', (d) => x(d.descriptor))
      .attr('width', x.bandwidth())
      .attr('y', (d) => y(d.value))
      .attr('height', (d) => innerH - y(d.value));

    // Built-in annotation: call out whichever descriptor changes the most
    // from low to high concentration — the biggest swing in either
    // direction — since that's this scene's central point. Position
    // tracks the bar's live height as the concentration slider moves.
    let gAnn = g.select('g.layer-annotations');
    if (gAnn.empty()) gAnn = g.append('g').attr('class', 'layer-annotations');

    const focus = entries.reduce(
      (best, e) => (!best || Math.abs(e.delta) > Math.abs(best.delta) ? e : best),
      null
    );

    if (focus) {
      const bx = x(focus.descriptor) + x.bandwidth() / 2;
      const by = y(focus.value);
      drawAnnotation(gAnn, {
        x: bx,
        y: by,
        dx: bx > innerW / 2 ? -184 : 16,
        dy: -72,
        title: 'Changes the most',
        text: [
          focus.descriptor,
          `${fmt(focus.lowValue)} → ${fmt(focus.highValue)} (low → high)`,
        ],
      });
    } else {
      gAnn.selectAll('*').remove();
    }
  }

  function renderAll() {
    if (!molecules.length) return;
    titleA.textContent = molecules[0].name;
    titleB.textContent = molecules[1] ? molecules[1].name : '';
    renderChart(svgA, molecules[0]);
    if (molecules[1]) renderChart(svgB, molecules[1]);
  }

  function render() {
    renderAll();
  }

  fetch(DATA_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
      return res.json();
    })
    .then((json) => {
      data = json;
      molecules = data.molecules || [];
      maxAbsDelta = molecules.reduce((max, m) => {
        const low = m.steps[0].values;
        const high = m.steps[m.steps.length - 1].values;
        Object.keys(low).forEach((descriptor) => {
          const delta = Math.abs((high[descriptor] ?? 0) - (low[descriptor] ?? 0));
          if (delta > max) max = delta;
        });
        return max;
      }, 0) || 1;
      updateSliderLabel();
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

export default { id: 'scene2', init, destroy };