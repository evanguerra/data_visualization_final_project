import scene1 from './scene1.js';
import scene2 from './scene2.js';
import scene3 from './scene3.js';

const scenes = [scene1, scene2, scene3];

const root = document.getElementById('scene-root');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const progressEl = document.getElementById('scene-progress');
const dotsEl = document.getElementById('nav-dots');

let current = 0;
let activeScene = null;

function pad(n) {
  return String(n).padStart(2, '0');
}

function buildDots() {
  dotsEl.innerHTML = '';
  scenes.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'nav-dot';
    dotsEl.appendChild(dot);
  });
}

function updateDots() {
  [...dotsEl.children].forEach((dot, i) => {
    dot.classList.toggle('is-active', i === current);
  });
}

function renderScene(index) {
  if (activeScene && typeof activeScene.destroy === 'function') {
    activeScene.destroy();
  }
  root.innerHTML = '';

  current = index;
  activeScene = scenes[current];

  try {
    activeScene.init(root, { onNext: goNext, onPrev: goPrev });
  } catch (err) {
    console.error(`Scene "${activeScene.id}" failed to initialize:`, err);
    root.innerHTML = `
      <div class="placeholder-scene">
        <h2>Scene didn't load</h2>
        <p>${err.message}. Check the console for details — this usually
        means a required script (like d3) didn't load.</p>
      </div>`;
  }

  prevBtn.disabled = current === 0;
  nextBtn.textContent = current === scenes.length - 1 ? 'Restart ↺' : 'Next →';
  progressEl.textContent = `${pad(current + 1)} / ${pad(scenes.length)}`;
  updateDots();
}

function goNext() {
  const nextIndex = (current + 1) % scenes.length;
  renderScene(nextIndex);
}

function goPrev() {
  if (current > 0) renderScene(current - 1);
}

prevBtn.addEventListener('click', goPrev);
nextBtn.addEventListener('click', goNext);

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') goNext();
  if (e.key === 'ArrowLeft') goPrev();
});

buildDots();
renderScene(0);