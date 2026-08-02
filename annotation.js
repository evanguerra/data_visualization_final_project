// Shared annotation template for the narrative visualization.
//
// This is the single template every scene uses to draw its "built-in"
// annotation: a small anchor dot on the data point being called out, a
// dashed connector line, and a text callout box with a title + 1-2 lines
// of supporting text. Using one function everywhere keeps annotation
// styling/placement logic consistent from scene to scene, per the
// assignment's requirement that annotations "follow a template for visual
// consistency."
//
// Critically, this is called directly from each scene's render() function
// (not from a mouseover handler), so the annotation is drawn as soon as the
// scene/parameters are set — it does not wait for user interaction.

const PADDING = 10;
const LINE_HEIGHT = 14;

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
  const anchorsLeft = dx < 0; // box sits to the left of the anchor point
  const boxX = anchorsLeft ? x + dx - width : x + dx;
  const boxY = y + dy;
  const boxHeight = PADDING * 2 + LINE_HEIGHT * (lines.length + 1);

  const g = layer.append('g').attr('class', 'annotation-callout');

  g.append('line')
    .attr('class', 'annotation-connector')
    .attr('x1', x).attr('y1', y)
    .attr('x2', boxX + width / 2)
    .attr('y2', boxY + boxHeight / 2);

  g.append('circle')
    .attr('class', 'annotation-anchor')
    .attr('cx', x).attr('cy', y)
    .attr('r', 4);

  const box = g.append('g').attr('transform', `translate(${boxX},${boxY})`);

  box.append('rect')
    .attr('class', 'annotation-box')
    .attr('width', width)
    .attr('height', boxHeight)
    .attr('rx', 4);

  box.append('text')
    .attr('class', 'annotation-title')
    .attr('x', PADDING)
    .attr('y', PADDING + 9)
    .text(title);

  box.selectAll('text.annotation-line')
    .data(lines)
    .enter()
    .append('text')
    .attr('class', 'annotation-line')
    .attr('x', PADDING)
    .attr('y', (d, i) => PADDING + 9 + LINE_HEIGHT * (i + 1))
    .text((d) => d);

  return g;
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
