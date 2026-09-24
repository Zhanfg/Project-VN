import fs from 'node:fs';
import path from 'node:path';

const distRoot = process.argv[2] ?? '.webgal/packages/webgal/dist';
const outputRoot = process.argv[3] ?? 'build/windows';
const shellRoot = path.join(outputRoot, 'shell-dist');
const dataRoot = path.join(outputRoot, 'game-data');

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(shellRoot, { recursive: true });
fs.mkdirSync(dataRoot, { recursive: true });

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (entry.isFile()) output.push(full);
  }
  return output;
}

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

const manifestPath = path.join(distRoot, 'game/runtime/resource-index.json');
if (!fs.existsSync(manifestPath)) {
  throw new Error('resource-index.json missing from WebGAL dist');
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const byPath = new Map((manifest.files ?? []).map((item) => [item.path, item]));

for (const source of walk(distRoot)) {
  const relative = path.relative(distRoot, source).replaceAll('\\', '/');

  if (!relative.startsWith('game/')) {
    copyFile(source, path.join(shellRoot, relative));
    continue;
  }

  const gameRelative = relative.slice('game/'.length);
  const item = byPath.get(gameRelative);
  const windowsDelivery = item?.delivery?.windows ?? 'external';

  if (windowsDelivery === 'shell') {
    copyFile(source, path.join(shellRoot, relative));
  } else {
    copyFile(source, path.join(dataRoot, gameRelative));
  }
}

const shellBytes = walk(shellRoot).reduce((sum, file) => sum + fs.statSync(file).size, 0);
const gameDataBytes = walk(dataRoot).reduce((sum, file) => sum + fs.statSync(file).size, 0);

fs.writeFileSync(
  path.join(outputRoot, 'layout.json'),
  JSON.stringify(
    {
      version: 1,
      shellBytes,
      gameDataBytes,
      shellDirectory: 'shell-dist',
      gameDataDirectory: 'game-data',
    },
    null,
    2,
  ) + '\n',
);

console.log('Windows layout prepared: shell=' + shellBytes + ' bytes, game-data=' + gameDataBytes + ' bytes');
