import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [shikiModulePath, sourceRoot = 'content/technical', outputRoot = 'game/technical/generated'] = process.argv.slice(2);
if (!shikiModulePath) {
  console.error('Usage: node build-technical-content.mjs <shiki-index.mjs> [source-root] [output-root]');
  process.exit(2);
}

const shikiModule = await import(pathToFileURL(path.resolve(shikiModulePath)).href);
const codeToHtml = shikiModule.codeToHtml;
if (typeof codeToHtml !== 'function') throw new Error('Shiki codeToHtml export not found');

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

function safeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function writePayload(id, payload) {
  if (!/^[a-z0-9_/-]+$/i.test(id) || id.includes('..')) throw new Error('Unsafe technical id: ' + id);
  const target = path.join(outputRoot, id + '.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(payload, null, 2) + '\n');
}

function decorateCodeHtml(html, focusLines = []) {
  const focus = new Set(focusLines.map(Number));
  let line = 0;
  return html.replace(/<span class="line">/g, () => {
    line += 1;
    const cls = focus.has(line) ? 'line tech-line-focus' : 'line';
    return '<span class="' + cls + '" data-line="' + line + '">';
  });
}

function plotSvg(points, visiblePoints) {
  const all = points.map(([x, y]) => [Number(x), Number(y)]);
  const shown = all.slice(0, visiblePoints ?? all.length);
  const width = 760;
  const height = 360;
  const pad = 42;
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const px = (x) => pad + ((x - minX) / dx) * (width - pad * 2);
  const py = (y) => height - pad - ((y - minY) / dy) * (height - pad * 2);
  const polyline = shown.map(([x, y]) => px(x).toFixed(2) + ',' + py(y).toFixed(2)).join(' ');
  const circles = shown
    .map(([x, y]) => '<circle cx="' + px(x).toFixed(2) + '" cy="' + py(y).toFixed(2) + '" r="4" fill="currentColor" />')
    .join('');

  return [
    '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="plot">',
    '<g fill="none" stroke="currentColor" stroke-opacity=".32">',
    '<line x1="' + pad + '" y1="' + (height - pad) + '" x2="' + (width - pad) + '" y2="' + (height - pad) + '" />',
    '<line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (height - pad) + '" />',
    '</g>',
    '<polyline points="' + polyline + '" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />',
    circles,
    '<g fill="currentColor" font-family="ui-monospace, monospace" font-size="15">',
    '<text x="' + pad + '" y="' + (height - 12) + '">' + safeXml(minX) + '</text>',
    '<text x="' + (width - pad) + '" y="' + (height - 12) + '" text-anchor="end">' + safeXml(maxX) + '</text>',
    '<text x="8" y="' + (height - pad) + '">' + safeXml(minY) + '</text>',
    '<text x="8" y="' + (pad + 5) + '">' + safeXml(maxY) + '</text>',
    '</g>',
    '</svg>',
  ].join('');
}

function diagramSvg(nodes, edges, activeNodes = []) {
  const width = 820;
  const height = 420;
  const active = new Set(activeNodes);
  const map = new Map(nodes.map((node) => [node.id, node]));

  const edgeSvg = edges.map((edge) => {
    const from = map.get(edge.from);
    const to = map.get(edge.to);
    if (!from || !to) throw new Error('Unknown diagram edge endpoint: ' + JSON.stringify(edge));
    const x1 = from.x + from.w / 2;
    const y1 = from.y + from.h / 2;
    const x2 = to.x + to.w / 2;
    const y2 = to.y + to.h / 2;
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
      '" stroke="currentColor" stroke-width="2" marker-end="url(#arrow)" opacity=".72" />';
  }).join('');

  const nodeSvg = nodes.map((node) => {
    const strong = active.has(node.id);
    return [
      '<g opacity="' + (strong ? '1' : '.72') + '">',
      '<rect x="' + node.x + '" y="' + node.y + '" width="' + node.w + '" height="' + node.h +
        '" rx="12" fill="none" stroke="currentColor" stroke-width="' + (strong ? '4' : '2') + '" />',
      '<text x="' + (node.x + node.w / 2) + '" y="' + (node.y + node.h / 2 + 5) +
        '" text-anchor="middle" fill="currentColor" font-family="system-ui, sans-serif" font-size="18">' +
        safeXml(node.label) + '</text>',
      '</g>',
    ].join('');
  }).join('');

  return [
    '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="diagram">',
    '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">',
    '<path d="M0,0 L8,4 L0,8 z" fill="currentColor" /></marker></defs>',
    edgeSvg,
    nodeSvg,
    '</svg>',
  ].join('');
}

function collect(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, output);
    else if (entry.isFile() && entry.name.endsWith('.tech.json')) output.push(full);
  }
  return output;
}

const entries = collect(sourceRoot).sort();

for (const file of entries) {
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!config.id || !config.kind) throw new Error(file + ': id and kind are required');

  if (config.kind === 'code') {
    const code = fs.readFileSync(config.source, 'utf8');
    const steps = [];
    const rawSteps = config.steps?.length ? config.steps : [{}];
    for (const step of rawSteps) {
      const html = await codeToHtml(code, {
        lang: config.language ?? 'text',
        theme: config.theme ?? 'github-dark',
      });
      steps.push({
        html: decorateCodeHtml(html, step.focusLines ?? []),
        caption: step.caption ?? '',
      });
    }
    writePayload(config.id, { kind: 'code', title: config.title ?? '', steps });
    continue;
  }

  if (config.kind === 'terminal' || config.kind === 'algorithm') {
    if (!Array.isArray(config.steps) || config.steps.length === 0) throw new Error(file + ': steps are required');
    writePayload(config.id, { kind: config.kind, title: config.title ?? '', steps: config.steps });
    continue;
  }

  if (config.kind === 'plot') {
    if (!Array.isArray(config.points) || config.points.length < 2) throw new Error(file + ': plot points are required');
    const steps = (config.steps?.length ? config.steps : [{}]).map((step) => ({
      svg: plotSvg(config.points, step.visiblePoints),
      caption: step.caption ?? '',
    }));
    writePayload(config.id, { kind: 'plot', title: config.title ?? '', steps });
    continue;
  }

  if (config.kind === 'diagram') {
    if (!Array.isArray(config.nodes) || !Array.isArray(config.edges)) throw new Error(file + ': nodes and edges are required');
    const steps = (config.steps?.length ? config.steps : [{}]).map((step) => ({
      svg: diagramSvg(config.nodes, config.edges, step.activeNodes ?? []),
      caption: step.caption ?? '',
    }));
    writePayload(config.id, { kind: 'diagram', title: config.title ?? '', steps });
    continue;
  }

  throw new Error(file + ': unsupported kind ' + config.kind);
}

console.log('Built ' + entries.length + ' technical presentation asset(s).');
