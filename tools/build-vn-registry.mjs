import fs from 'node:fs';
import path from 'node:path';

const source = process.argv[2] ?? 'content/vn/registry.json';
const output = process.argv[3] ?? 'game/vn/generated/registry.json';

const registry = JSON.parse(fs.readFileSync(source, 'utf8'));
const collectionNames = ['routes', 'branches', 'endings', 'chapters'];

if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
  throw new Error('VN registry root must be an object.');
}

const normalized = {
  ...registry,
  version: Number.isFinite(Number(registry.version)) ? Number(registry.version) : 1,
};

for (const name of collectionNames) {
  normalized[name] = Array.isArray(registry[name]) ? registry[name] : [];
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(normalized, null, 2) + '\n');
console.log(
  'Built VN registry: ' +
    collectionNames.map((name) => name + '=' + normalized[name].length).join(', '),
);
