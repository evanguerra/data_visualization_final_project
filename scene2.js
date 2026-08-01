function init(container, { onNext, onPrev } = {}) {
  container.innerHTML = `
    <div class="scene">
      <div class="scene__viz">
        <div class="placeholder-scene">
        </div>
      </div>
    </div>
  `;
}

function destroy() {}

export default { id: 'scene2', init, destroy };
