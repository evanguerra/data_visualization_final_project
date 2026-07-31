function init(container, { onNext, onPrev } = {}) {
  container.innerHTML = `
    <div class="scene">
      <div class="scene__viz">
        <div class="placeholder-scene">
          <h2>Scene 02</h2>
          <p>Next up: whatever you'd like to explore from here — e.g. a
             per-molecule descriptor breakdown, a similarity search, or a
             zoom into a cluster from the PCA map.</p>
        </div>
      </div>
    </div>
  `;
}

function destroy() {}

export default { id: 'scene2', init, destroy };
