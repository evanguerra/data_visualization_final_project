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
