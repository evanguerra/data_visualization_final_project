import scene0 from './scene0.js';
import scene1 from './scene1.js';
import scene2 from './scene2.js';
import scene3 from './scene3.js';
import scene4 from './scene4.js';

const primaryScenes = [scene0, scene1, scene2, scene3];

const root = document.getElementById('scene-root');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const progressEl = document.getElementById('scene-progress');
const dotsEl = document.getElementById('nav-dots');

let current = 0;
let activeScene = null;
let mode = 'primary';
let lastPrimaryIndex = 0;

function pad(n) {
  return String(n).padStart(2, '0');
}

function buildDots() {
  dotsEl.innerHTML = '';
  primaryScenes.forEach(() => {
    const dot = document.createElement('span');
    dot.className = 'nav-dot';
    dotsEl.appendChild(dot);
  });
}

function updateDots() {
  [...dotsEl.children].forEach((dot, i) => {
    dot.classList.toggle('is-active', mode === 'primary' && i === current);
  });
}

function destroyActive() {
  if (activeScene && typeof activeScene.destroy === 'function') {
    activeScene.destroy();
  }
  root.innerHTML = '';
}

function renderScene(index) {
  destroyActive();
  mode = 'primary';
  current = index;
  lastPrimaryIndex = index;
  activeScene = primaryScenes[current];

  activeScene.init(root, { onNext: goNext, onPrev: goPrev, onSelectMolecule: goToDetail });

  prevBtn.disabled = current === 0;
  prevBtn.textContent = 'Back';
  nextBtn.style.display = '';
  if (current === primaryScenes.length - 1) {
    nextBtn.textContent = 'Restart';
  } else {
    const upNext = primaryScenes[current + 1];
    nextBtn.textContent = `Next: ${upNext.shortTitle || 'Continue'}`;
  }
  progressEl.textContent = `${pad(current + 1)} / ${pad(primaryScenes.length)}`;
  dotsEl.style.display = '';
  updateDots();
}

function renderDetail(molecule) {
  destroyActive();
  mode = 'detail';
  activeScene = scene4;

  activeScene.init(root, { onBack: goBackToPrimary, molecule });

  prevBtn.disabled = false;
  prevBtn.textContent = 'Back to atlas';
  nextBtn.style.display = 'none';
  progressEl.textContent = molecule && molecule.name ? `Exploring · ${molecule.name}` : 'Exploring';
  dotsEl.style.display = 'none';
}

function goToDetail(molecule) {
  renderDetail(molecule);
}

function goBackToPrimary() {
  renderScene(lastPrimaryIndex);
}

function goNext() {
  if (mode === 'detail') {
    goBackToPrimary();
    return;
  }
  const nextIndex = (current + 1) % primaryScenes.length;
  renderScene(nextIndex);
}

function goPrev() {
  if (mode === 'detail') {
    goBackToPrimary();
    return;
  }
  if (current > 0) renderScene(current - 1);
}

prevBtn.addEventListener('click', goPrev);
nextBtn.addEventListener('click', goNext);

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') goNext();
  if (e.key === 'ArrowLeft') goPrev();
  if (e.key === 'Escape' && mode === 'detail') goBackToPrimary();
});

buildDots();
renderScene(0);
