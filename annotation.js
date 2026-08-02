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

  return {
    dx: preferRight ? 24 : -(width + 24),
    dy: preferUp ? -(boxHeight + 10) : 20,
  };
}
