function init(container, { onNext, onPrev } = {}) {
  container.innerHTML = `
    <div class="scene">
      <div class="scene__viz">
        <div class="placeholder-scene">
          <h2>Scene 03</h2>
          <p>Final stop in the story. The nav's "Restart" button loops back to Scene 01.</p>
        </div>
      </div>
    </div>
  `;
}

function destroy() {}

export default { id: 'scene3', init, destroy };

