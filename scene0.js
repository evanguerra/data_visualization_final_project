function buildDom(container) {
  container.innerHTML = `
    <div class="intro-scene">
      <div>
        <div class="intro-scene__eyebrow">Start here</div>
        <h1 class="intro-scene__title">Odor Space Atlas</h1>
        <p class="intro-scene__desc">
          160 odor stimuli were rated by panelists across 146 descriptors
          (like "floral," "sour," "musty"). This site walks through what
          those ratings look like when reduced to a 2D map, how individual
          descriptors shift with concentration, and how a handful of
          molecules move through that space as they get stronger. It's a
          short, four-part guided tour &mdash; each part builds on the last.
        </p>
      </div>

      <div class="intro-grid">
        <div class="intro-card">
          <p class="intro-card__label">Getting around</p>
          <p>
            Use the <strong>Next / Back</strong> buttons or the
            <span class="intro-kbd">&larr;</span> <span class="intro-kbd">&rarr;</span>
            arrow keys to move between the four scenes. The dots at the
            bottom show where you are.
          </p>
        </div>
        <div class="intro-card">
          <p class="intro-card__label">The "Reading" box</p>
          <p>
            At the top of every scene, this box tells you exactly what
            you're looking at. It updates live as you hover or click things
            below &mdash; check it first if a chart looks unfamiliar.
          </p>
        </div>
        <div class="intro-card">
          <p class="intro-card__label">Hover &amp; click</p>
          <p>
            Points and bars are interactive: hover for a quick tooltip,
            click to pin a selection. A dashed callout box also appears
            automatically on each scene to flag the most notable data point.
          </p>
        </div>
        <div class="intro-card">
          <p class="intro-card__label">Low vs. high concentration</p>
          <p>
            A few molecules were rated at two strengths &mdash; a
            <strong>low</strong> and a <strong>high</strong> concentration
            &mdash; because smell isn't fixed: the same molecule can read
            very differently depending on how much of it you're smelling.
          </p>
        </div>
      </div>

      <p class="intro-scene__cta">Click "Next" (or press &rarr;) to begin.</p>
    </div>
  `;
}

function init(container) {
  buildDom(container);
}

function destroy() {}

export default { id: 'scene0', shortTitle: 'Overview', init, destroy };
