function buildDom(container) {
  container.innerHTML = `
    <div class="intro-scene">
      <div>
        <div class="intro-scene__eyebrow">Start here</div>
        <h1 class="intro-scene__title">Odor Space Atlas</h1>
        <p class="intro-scene__desc">
          This visualization explores the Arctander 1960 dataset which contains 160 odor stimuli that were rated by 
          panelists across 146 descriptors for example "floral," "sour," or "musty". This visualization walks through 
          what those 146-dimensional odor descriptions look like when reduced to a 2D map, how individual descriptors 
          shift with concentration, and how a handful of molecules move through that space as they get stronger. It's a
          short, four-part guided tour with each part building on the last.
        </p>
      </div>
    </div>
  `;
}

function init(container) {
  buildDom(container);
}

function destroy() {}

export default { id: 'scene0', shortTitle: 'Overview', init, destroy };
