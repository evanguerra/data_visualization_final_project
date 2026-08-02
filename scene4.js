import { drawAnnotation } from './annotation.js';

const DATA_URL = 'data/trajectories.json';
const N_BARS_SHOWN = 20;

const CATEGORY_LABELS = {
  grows: 'Grows low to high',
  emergent: 'Emergent (near-zero at low)',
  shrinks: 'Shrinks low to high',
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
          <div class="scene__eyebrow" id="s4-eyebrow">Scene 04 - Explore a molecule</div>
          <h1 class="scene__title" id="s4-mol-title">—</h1>
          <p class="scene__desc" id="s4-mol-sub"></p>
        </div>
      </div>

      <div class="scene__body">
        <div class="scene__viz scene__viz--stack" id="s4-viz">
          <div class="bar-chart-row" style="flex: 1 1 100%; padding: 20px 24px 8px;">
            <div class="bar-chart-row__title" id="s4-title"></div>
            <div class="bar-chart-row__body">
              <svg id="s4-svg" width="100%" height="100%"></svg>
            </div>
          </div>
          <div class="viz-tooltip" id="s4-tooltip"></div>
        </div>
        <aside class="scene__controls">
          <div class="scene__reading">
            <p class="panel-block__label">Descriptor Details</p>
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
            <p class="panel-block__label">Color - Change from low to high</p>
            <div class="legend-scale" style="background: linear-gradient(90deg, #123C56, #7FAFC9, #E7C27A, #8A4A0E);"></div>
            <div class="legend-scale-labels">
              <span>Shrinks a lot</span><span>Little change</span><span>Grows a lot</span>
            </div>
            <div class="legend-swatch-row">
              <span class="legend-swatch" style="background:var(--accent-magenta)"></span>
              <span>Emergent (near-zero at low)</span>
            </div>
            <div class="legend-swatch-row">
              <span class="legend-swatch" style="background:var(--accent-teal)"></span>
              <span>Fading (near-zero at high)</span>
            </div>
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

function init(container, { onBack, molecule: moleculeRef } = {}) {
  buildDom(container);

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

  const growColorScale = d3.interpolateRgb('#E7C27A', '#8A4A0E');
  const shrinkColorScale = d3.interpolateRgb('#7FAFC9', '#123C56');
  let maxAbsDelta = 1;

  function changeColor(delta) {
    const raw = Math.min(1, Math.abs(delta) / maxAbsDelta);
    const t = 0.12 + 0.88 * raw;
    return delta >= 0 ? growColorScale(t) : shrinkColorScale(t);
  }

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
    const categories = molecule.descriptor_categories || {};

    const mustInclude = Object.keys(lowStep.values).filter(
      (descriptor) => categories[descriptor] === 'emergent' || categories[descriptor] === 'fading'
    );

    const ranked = Object.entries(lowStep.values)
      .sort((a, b) => b[1] - a[1])
      .map(([descriptor]) => descriptor);

    const combined = [...mustInclude];
    for (const descriptor of ranked) {
      if (combined.length >= N_BARS_SHOWN) break;
      if (!combined.includes(descriptor)) combined.push(descriptor);
    }

    combined.sort((a, b) => (lowStep.values[b] ?? 0) - (lowStep.values[a] ?? 0));

    fixedDescriptors = combined;
  }

  function entriesForStep() {
    const step = molecule.steps[stepIndex];
    const lowStep = molecule.steps[0];
    const highStep = molecule.steps[molecule.steps.length - 1];
    return fixedDescriptors.map((descriptor) => ({
      descriptor,
      value: step.values[descriptor],
      lowValue: lowStep.values[descriptor],
      highValue: highStep.values[descriptor],
      delta: (highStep.values[descriptor] ?? 0) - (lowStep.values[descriptor] ?? 0),
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
      <div class="readout__row"><span>Change (low to high)</span><span>${fmt(entry.lowValue)} → ${fmt(entry.highValue)}</span></div>
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
      .attr('fill', (d) => {
        if (d.category === 'emergent') return 'var(--accent-magenta)';
        if (d.category === 'fading') return 'var(--accent-teal)';
        return changeColor(d.delta);
      })
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

      maxAbsDelta = json.molecules.reduce((max, m) => {
        const low = m.steps[0].values;
        const high = m.steps[m.steps.length - 1].values;
        Object.keys(low).forEach((descriptor) => {
          const delta = Math.abs((high[descriptor] ?? 0) - (low[descriptor] ?? 0));
          if (delta > max) max = delta;
        });
        return max;
      }, 0) || 1;

      titleEl.textContent = molecule.name;
      molTitleEl.textContent = molecule.name;
      molSubEl.textContent = `CAS ${molecule.cas || '—'} · Top ${N_BARS_SHOWN} descriptors at low concentration. Drag the slider to watch them shift.`;

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
