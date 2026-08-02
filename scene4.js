import { drawAnnotation } from './annotation.js';

const DATA_URL = 'data/trajectories.json';
const N_BARS_SHOWN = 16;

const CATEGORY_COLORS = {
  grows: 'var(--accent-amber)',
  emergent: 'var(--accent-magenta)',
  shrinks: 'var(--accent-blue)',
  fading: 'var(--ink-faint)',
  flat: 'var(--line-strong)',
};

const CATEGORY_LABELS = {
  grows: 'Grows low → high',
  emergent: 'Emergent (near-zero at low)',
  shrinks: 'Shrinks low → high',
  fading: 'Fading (near-zero at high)',
  flat: 'Flat',
};

let resizeObserver = null;

function fmt(n, digits = 1) {
  if (n === null || n === undefined) return '—';
  return typeof n === 'number' ? n.toFixed(digits) : n;
}

function buildDom(container) {
  container.innerHTML = `
    <div class="scene" id="scene4">
      <div class="scene__intro">
        <div class="scene__intro-text">
          <button class="back-link" id="s4-back" type="button">&larr; Back to atlas</button>
          <div class="scene__eyebrow" id="s4-eyebrow">Scene 04 · Explore a molecule</div>
          <h1 class="scene__title" id="s4-mol-title">—</h1>
          <p class="scene__desc" id="s4-mol-sub"></p>
        </div>
      </div>

      <div class="scene__body">
        <div class="scene__viz" id="s4-viz">
          <div class="bar-chart-row" style="padding: 20px 24px 8px;">
            <div class="bar-chart-row__title" id="s4-title"></div>
            <div class="bar-chart-row__body">
              <svg id="s4-svg" width="100%" height="100%"></svg>
            </div>
          </div>
          <div class="viz-tooltip" id="s4-tooltip"></div>
        </div>
        <aside class="scene__controls">
          <div class="scene__reading">
            <p class="panel-block__label">Reading</p>
            <div class="readout" id="s4-readout">
              <p class="readout-empty">Hover or click a bar to inspect it.</p>
            </div>
          </div>

          <div class="panel-block">
            <p class="panel-block__label" id="s4-slider-label">Concentration: Low (step 1 / 6)</p>
            <input type="range" id="s4-conc-slider" class="conc-slider" min="0" max="5" step="1" value="0" />
            <div class="legend-scale-labels">
              <span>Low</span><span>High</span>
            </div>
          </div>

          <div class="panel-block">
            <p class="panel-block__label">Trajectory category</p>
            <div class="legend-list" id="s4-legend"></div>
          </div>

          <div class="panel-block">
            <p class="panel-block__label">Biggest movers</p>
            <div class="readout" id="s4-movers"></div>
          </div>
        </aside>
      </div>
    </div>
  `;
}

function buildLegend(container) {
  container.innerHTML = Object.entries(CATEGORY_LABELS).map(([key, label]) => `
    <div class="legend-swatch-row">
      <span class="legend-swatch" style="background:${CATEGORY_COLORS[key]}"></span>
      <span>${label}</span>
    </div>
  `).join('');
}

function init(container, { onBack, molecule: moleculeRef } = {}) {
  if (typeof d3 === 'undefined') {
    throw new Error('d3 is not loaded — check that assets/d3.min.js is present and loads before main.js');
  }

  buildDom(container);
  buildLegend(container.querySelector('#s4-legend'));

  const vizEl = container.querySelector('#s4-viz');
  const svg = d3.select(container.querySelector('#s4-svg'));
  const titleEl = container.querySelector('#s4-title');
  const tooltipEl = container.querySelector('#s4-tooltip');
  const readoutEl = container.querySelector('#s4-readout');
  const moversEl = container.querySelector('#s4-movers');
  const molTitleEl = container.querySelector('#s4-mol-title');
  const molSubEl = container.querySelector('#s4-mol-sub');
  const slider = container.querySelector('#s4-conc-slider');
  const sliderLabel = container.querySelector('#s4-slider-label');
  const backBtn = container.querySelector('#s4-back');

  backBtn.addEventListener('click', () => {
    if (typeof onBack === 'function') onBack();
  });

  let molecule = null;
  let stepIndex = 0;
  let selected = null;
  let fixedDescriptors = [];

  slider.addEventListener('input', () => {
    stepIndex = Number(slider.value);
    updateSliderLabel();
    render();
  });

  function updateSliderLabel() {
    const step = molecule ? molecule.steps[stepIndex] : null;
    const stepLabel = step ? step.label : '';
    sliderLabel.textContent = `Concentration: ${stepLabel} (step ${stepIndex + 1} / 6)`;
  }

  function computeFixedDescriptors() {
    const lowStep = molecule.steps[0];
    fixedDescriptors = Object.entries(lowStep.values)
      .sort((a, b) => b[1] - a[1])
      .slice(0, N_BARS_SHOWN)
      .map(([descriptor]) => descriptor);
  }

  function entriesForStep() {
    const step = molecule.steps[stepIndex];
    return fixedDescriptors.map((descriptor) => ({
      descriptor,
      value: step.values[descriptor],
      category: molecule.descriptor_categories[descriptor] || 'flat',
    }));
  }

  function renderReadout(entry) {
    if (!entry) {
      readoutEl.innerHTML = '<p class="readout-empty">Hover or click a bar to inspect it.</p>';
      return;
    }
    readoutEl.innerHTML = `
      <div class="readout__name">${entry.descriptor}</div>
      <div class="readout__row"><span>Rating (${molecule.steps[stepIndex].label})</span><span>${fmt(entry.value)}</span></div>
      <div class="readout__row"><span>Trajectory</span><span>${CATEGORY_LABELS[entry.category] || entry.category}</span></div>
    `;
  }

  function renderMovers() {
    const movers = molecule.highlights && molecule.highlights.biggest_movers
      ? molecule.highlights.biggest_movers.slice(0, 6)
      : [];
    if (!movers.length) {
      moversEl.innerHTML = '<p class="readout-empty">—</p>';
      return;
    }
    moversEl.innerHTML = movers.map((descriptor) => {
      const low = molecule.steps[0].values[descriptor];
      const high = molecule.steps[molecule.steps.length - 1].values[descriptor];
      const arrow = high > low ? '↑' : '↓';
      return `<div class="readout__row"><span>${descriptor}</span><span>${fmt(low)} ${arrow} ${fmt(high)}</span></div>`;
    }).join('');
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

  function render() {
    if (!molecule) return;

    const colEl = svg.node().parentElement;
    const width = colEl.clientWidth;
    const height = colEl.clientHeight;
    const margin = { top: 12, right: 24, bottom: 92, left: 52 };
    const innerW = Math.max(10, width - margin.left - margin.right);
    const innerH = Math.max(10, height - margin.top - margin.bottom);

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const entries = entriesForStep();

    const x = d3.scaleBand()
      .domain(entries.map((d) => d.descriptor))
      .range([0, innerW])
      .padding(0.26);

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
      .call(d3.axisLeft(y).ticks(6).tickSize(4));

    g.select('.layer-axis-x')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSize(4))
      .selectAll('text')
      .attr('transform', 'rotate(-35)')
      .attr('text-anchor', 'end')
      .attr('dx', '-0.4em')
      .attr('dy', '0.4em')
      .text((d) => (d.length > 24 ? d.slice(0, 23) + '…' : d));

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
      .attr('fill', (d) => CATEGORY_COLORS[d.category] || 'var(--line-strong)')
      .classed('is-selected', (d) => selected && selected.descriptor === d.descriptor)
      .on('mouseenter', (event, d) => {
        renderReadout(d);
        moveTooltip(event, d);
      })
      .on('mousemove', (event, d) => moveTooltip(event, d))
      .on('mouseleave', () => {
        hideTooltip();
        renderReadout(selected ? selected.entry : null);
      })
      .on('click', (event, d) => {
        if (selected && selected.descriptor === d.descriptor) {
          selected = null;
          renderReadout(null);
        } else {
          selected = { descriptor: d.descriptor, entry: d };
          renderReadout(d);
        }
        g.select('.layer-bars').selectAll('rect.bar')
          .classed('is-selected', (dd) => selected && selected.descriptor === dd.descriptor);
      })
      .transition().duration(300)
      .attr('x', (d) => x(d.descriptor))
      .attr('width', x.bandwidth())
      .attr('y', (d) => y(d.value))
      .attr('height', (d) => innerH - y(d.value));

    // Built-in annotation: call out this molecule's single biggest mover
    // (from its precomputed highlights), tracking the bar's live height as
    // the concentration slider moves.
    let gAnn = g.select('g.layer-annotations');
    if (gAnn.empty()) gAnn = g.append('g').attr('class', 'layer-annotations');

    const topMoverName = molecule.highlights && molecule.highlights.biggest_movers
      ? molecule.highlights.biggest_movers[0]
      : null;
    const focus = topMoverName ? entries.find((e) => e.descriptor === topMoverName) : null;

    if (focus) {
      const bx = x(focus.descriptor) + x.bandwidth() / 2;
      const by = y(focus.value);
      drawAnnotation(gAnn, {
        x: bx,
        y: by,
        dx: bx > innerW / 2 ? -184 : 16,
        dy: -72,
        title: 'Biggest mover',
        text: [
          focus.descriptor,
          `${fmt(focus.value)} at ${molecule.steps[stepIndex].label.toLowerCase()} conc.`,
        ],
      });
    } else {
      gAnn.selectAll('*').remove();
    }
  }

  fetch(DATA_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
      return res.json();
    })
    .then((json) => {
      const cid = moleculeRef && moleculeRef.cid;
      molecule = json.molecules.find((m) => m.cid === cid) || json.molecules[0];

      if (!molecule) {
        throw new Error('No molecule data available.');
      }

      titleEl.textContent = molecule.name;
      molTitleEl.textContent = molecule.name;
      molSubEl.textContent = `CAS ${molecule.cas || '—'} · ${N_BARS_SHOWN} top descriptors at low concentration. Drag the slider to watch them shift.`;

      computeFixedDescriptors();
      renderMovers();
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

export default { id: 'scene4', init, destroy };
