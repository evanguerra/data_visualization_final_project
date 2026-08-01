const DATA_URL = 'data/trajectories.json';
const N_BARS_SHOWN = 10;

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
let tooltipEls = {};

function fmt(n, digits = 1) {
  if (n === null || n === undefined) return '—';
  return typeof n === 'number' ? n.toFixed(digits) : n;
}

function buildDom(container) {
  container.innerHTML = `
    <div class="scene" id="scene2">
      <div class="scene__viz scene__viz--split" id="s2-viz">
        <div class="bar-chart-col">
          <div class="bar-chart-col__title" id="s2-title-a"></div>
          <div class="bar-chart-col__body">
            <svg id="s2-svg-a" width="100%" height="100%"></svg>
          </div>
        </div>
        <div class="bar-chart-col">
          <div class="bar-chart-col__title" id="s2-title-b"></div>
          <div class="bar-chart-col__body">
            <svg id="s2-svg-b" width="100%" height="100%"></svg>
          </div>
        </div>
        <div class="viz-tooltip" id="s2-tooltip"></div>
      </div>
      <aside class="scene__panel">
        <div>
          <div class="scene__eyebrow">Scene 02 · Descriptor profiles</div>
          <h1 class="scene__title">Top Descriptors</h1>
          <p class="scene__desc">
            The ${N_BARS_SHOWN} highest-rated descriptors for each molecule,
            at low or high presented concentration. Bar color shows how that
            descriptor's rating moves across the concentration range.
          </p>
        </div>

        <div class="panel-block">
          <div class="toggle-row">
            <span id="s2-toggle-label">Concentration: Low</span>
            <button class="toggle-switch" id="s2-conc-toggle" type="button" aria-pressed="false"></button>
          </div>
        </div>

        <div class="panel-block">
          <p class="panel-block__label">Trajectory category</p>
          <div class="legend-list" id="s2-legend"></div>
        </div>

        <div class="panel-block" style="flex: 1 1 auto;">
          <p class="panel-block__label">Reading</p>
          <div class="readout" id="s2-readout">
            <p class="readout-empty">Hover or click a bar to inspect it.</p>
          </div>
        </div>
      </aside>
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

function init(container, { onNext, onPrev } = {}) {
  if (typeof d3 === 'undefined') {
    throw new Error('d3 is not loaded — check that assets/d3.min.js is present and loads before main.js');
  }

  buildDom(container);
  buildLegend(container.querySelector('#s2-legend'));

  const vizEl = container.querySelector('#s2-viz');
  const svgA = d3.select(container.querySelector('#s2-svg-a'));
  const svgB = d3.select(container.querySelector('#s2-svg-b'));
  const titleA = container.querySelector('#s2-title-a');
  const titleB = container.querySelector('#s2-title-b');
  const tooltipEl = container.querySelector('#s2-tooltip');
  const readoutEl = container.querySelector('#s2-readout');
  const toggleBtn = container.querySelector('#s2-conc-toggle');
  const toggleLabel = container.querySelector('#s2-toggle-label');

  tooltipEls = { el: tooltipEl };

  let data = null;
  let molecules = [];
  let showHigh = false;
  let selected = null; // { moleculeName, descriptor }

  toggleBtn.addEventListener('click', () => {
    showHigh = !showHigh;
    toggleBtn.classList.toggle('is-on', showHigh);
    toggleBtn.setAttribute('aria-pressed', String(showHigh));
    toggleLabel.textContent = `Concentration: ${showHigh ? 'High' : 'Low'}`;
    render();
  });

  function stepFor(molecule) {
    // steps[0] is 'low' (t=0), steps[last] is 'high' (t=1)
    return showHigh ? molecule.steps[molecule.steps.length - 1] : molecule.steps[0];
  }

  function topDescriptors(molecule) {
    const step = stepFor(molecule);
    return Object.entries(step.values)
      .map(([descriptor, value]) => ({
        descriptor,
        value,
        category: molecule.descriptor_categories[descriptor] || 'flat',
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, N_BARS_SHOWN);
  }

  function renderReadout(entry, molecule) {
    if (!entry) {
      readoutEl.innerHTML = '<p class="readout-empty">Hover or click a bar to inspect it.</p>';
      return;
    }
    readoutEl.innerHTML = `
      <div class="readout__name">${entry.descriptor}</div>
      <div class="readout__row"><span>Molecule</span><span>${molecule.name}</span></div>
      <div class="readout__row"><span>Rating (${showHigh ? 'high' : 'low'})</span><span>${fmt(entry.value)}</span></div>
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
    const margin = { top: 16, right: 16, bottom: 92, left: 44 };
    const innerW = Math.max(10, width - margin.left - margin.right);
    const innerH = Math.max(10, height - margin.top - margin.bottom);

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const entries = topDescriptors(molecule);

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
      .attr('transform', 'rotate(-40)')
      .attr('text-anchor', 'end')
      .attr('dx', '-0.4em')
      .attr('dy', '0.4em')
      .text((d) => (d.length > 18 ? d.slice(0, 17) + '…' : d));

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