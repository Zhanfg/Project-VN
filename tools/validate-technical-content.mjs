import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? 'game/technical/generated';
const allowedKinds = new Set(['code', 'terminal', 'algorithm', 'plot', 'diagram', 'circuit', 'instrument', 'protocol']);
let count = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

    const value = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!allowedKinds.has(value.kind)) throw new Error(full + ': invalid kind');
    if (!Array.isArray(value.steps) || value.steps.length === 0) throw new Error(full + ': empty steps');
    count += 1;
  }
}

walk(root);
if (count === 0) throw new Error('No generated technical content found');
console.log('Technical content validation passed: ' + count + ' asset(s).');
