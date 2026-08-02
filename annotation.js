// Shared annotation template for the narrative visualization.
//
// This wraps d3.annotation (the d3-svg-annotation library, loaded globally
// as window.d3.annotation* via assets/d3-annotation.min.js) instead of
// hand-drawing the callout box with raw SVG. Every scene still calls
// drawAnnotation(layer, config) / pickAnnotationOffset(...) exactly as
// before — only the rendering internals changed, so scene1.js / scene2.js /
// scene3.js needed no edits.
//
// d3.annotationCalloutCircle gives us the same three pieces our old
// template had: a small circular "subject" marker on the data point, a
// connector line/elbow out to a note box, and the note box itself. Styling
// for all of it lives in style.css under the .annotation-* class names
// this library generates (annotation-subject, annotation-connector,
// annotation-note-bg/-title/-label).
//
// Critically, like the old version, this is called directly from each
// scene's render() function (not from a mouseover handler) — the
// annotation is drawn as soon as the scene/parameters are set, not on
// hover.

export function drawAnnotation(layer, config) {
  layer.selectAll('*').remove();

  if (!config || config.x == null || config.y == null) return null;

  const {
    x, y,
    dx = 24,
    dy = -28,
    title = '',
    text = [],
    width = 176,
  } = config;

  const lines = Array.isArray(text) ? text : [text];

  // d3.annotation's note has one title (bold heading) and one label
  // (smaller, auto-wrapped body text) — not an arbitrary array of lines
  // like the old template. The scene-provided "title" (a category, e.g.
  // "Most intense stimulus") becomes the heading; the specific details
  // (e.g. a stimulus name + its value) are joined into the wrapped label.
  const label = lines.join('  —  ');

  const makeAnnotations = d3.annotation()
    .type(d3.annotationCalloutCircle)
    .annotations([{
      note: { title, label, wrap: width, padding: 6 },
      x, y, dx, dy,
      subject: { radius: 4, radiusPadding: 2 },
    }]);

  layer.call(makeAnnotations);
  return layer;
}

export function clearAnnotation(layer) {
  layer.selectAll('*').remove();
}

// Shared collision-avoidance for the annotation callout box. Rather than a
// single hard-coded quadrant rule (which can still land the box on top of
// a nearby data point), this tries a small set of candidate positions —
// on either side of the anchor, at a few vertical offsets — measures how
// many of the chart's own points each candidate box would cover, and
// returns the first collision-free one it finds (or, failing that, the
// candidate with the fewest overlaps that still fits inside the chart).
//
// This logic is independent of how the annotation itself gets drawn, so
// it's unchanged from the original hand-rolled version.
const PADDING = 10;
const LINE_HEIGHT = 14;

export function pickAnnotationOffset({
  x, y,
  points = [],
  innerW,
  innerH,
  width = 176,
  lines = 2,
  margin = 8,
}) {
  const boxHeight = PADDING * 2 + LINE_HEIGHT * (lines + 1);

  const preferRight = x < innerW / 2;
  const preferUp = y > innerH / 2;

  const dxOptions = preferRight ? [24, -(width + 24)] : [-(width + 24), 24];
  const dyOptions = preferUp
    ? [-(boxHeight + 46), -(boxHeight + 10), 20, 60, 100]
    : [20, 60, 100, -(boxHeight + 46), -(boxHeight + 10)];

  let best = null;

  for (const dx of dxOptions) {
    for (const dy of dyOptions) {
      const anchorsLeft = dx < 0;
      const boxX = anchorsLeft ? x + dx - width : x + dx;
      const boxY = y + dy;

      // Skip candidates that would push the box outside the chart area.
      if (boxX < -margin || boxX + width > innerW + margin) continue;
      if (boxY < -margin || boxY + boxHeight > innerH + margin) continue;

      let overlaps = 0;
      for (const p of points) {
        const r = p.r || 3;
        const overlapsX = p.x + r > boxX - margin && p.x - r < boxX + width + margin;
        const overlapsY = p.y + r > boxY - margin && p.y - r < boxY + boxHeight + margin;
        if (overlapsX && overlapsY) overlaps += 1;
      }

      if (!best || overlaps < best.overlaps) {
        best = { dx, dy, overlaps };
        if (overlaps === 0) return { dx, dy };
      }
    }
  }

  if (best) return { dx: best.dx, dy: best.dy };

  // Nothing fit cleanly inside the chart bounds — fall back to the
  // original quadrant-based default rather than failing outright.
  return {
    dx: preferRight ? 24 : -(width + 24),
    dy: preferUp ? -(boxHeight + 10) : 20,
  };
}
