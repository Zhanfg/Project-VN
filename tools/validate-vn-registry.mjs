import fs from 'node:fs';

const file = process.argv[2] ?? 'game/vn/generated/registry.json';
const registry = JSON.parse(fs.readFileSync(file, 'utf8'));
const collections = ['routes', 'branches', 'endings', 'chapters'];
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function warn(message) {
  console.warn('WARN: ' + message);
}

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._/-]+$/.test(value) && !value.includes('..');
}

for (const collection of collections) {
  const items = registry[collection];
  if (!Array.isArray(items)) {
    fail(collection + ' must be an array.');
    continue;
  }

  const seen = new Set();
  for (const [index, item] of items.entries()) {
    const prefix = collection + '[' + index + ']';
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail(prefix + ' must be an object.');
      continue;
    }

    if (!validId(item.id)) {
      fail(prefix + '.id must use letters, numbers, dot, underscore, slash, or hyphen.');
      continue;
    }

    if (seen.has(item.id)) fail(collection + ': duplicate id "' + item.id + '".');
    seen.add(item.id);

    if (item.title !== undefined && typeof item.title !== 'string') {
      fail(prefix + '.title must be a string when present.');
    }
    if (item.kind !== undefined && typeof item.kind !== 'string') {
      fail(prefix + '.kind must be a string when present.');
    }
    if (item.group !== undefined && typeof item.group !== 'string') {
      fail(prefix + '.group must be a string when present.');
    }
    if (item.order !== undefined && !Number.isFinite(Number(item.order))) {
      fail(prefix + '.order must be numeric when present.');
    }
    if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.some((tag) => typeof tag !== 'string'))) {
      fail(prefix + '.tags must be a string array when present.');
    }
    if (item.target !== undefined) {
      if (!item.target || typeof item.target !== 'object' || Array.isArray(item.target)) {
        fail(prefix + '.target must be an object when present.');
      } else if (
        item.target.scene !== undefined &&
        typeof item.target.scene !== 'string'
      ) {
        fail(prefix + '.target.scene must be a string when present.');
      } else if (
        item.target.label !== undefined &&
        typeof item.target.label !== 'string'
      ) {
        fail(prefix + '.target.label must be a string when present.');
      }
    }

    // Story design is intentionally allowed to lead implementation.
    // Missing cross references or scene targets are warnings, not hard failures.
    if (item.routeId !== undefined && typeof item.routeId === 'string') {
      const exists = (registry.routes ?? []).some((route) => route.id === item.routeId);
      if (!exists) warn(prefix + '.routeId points to a route not registered yet: ' + item.routeId);
    }
  }
}

if (failed) process.exit(1);
console.log(
  'VN registry validation passed: ' +
    collections.map((name) => name + '=' + (registry[name]?.length ?? 0)).join(', '),
);
