import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.webgal';
const sourceRoot = process.argv[3] ?? 'engine/timed-choice';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function write(relativePath, content) {
  const full = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

const chooseTarget = 'packages/webgal/src/Core/gameScripts/choose/index.tsx';
write(chooseTarget, fs.readFileSync(path.join(sourceRoot, 'choose.tsx'), 'utf8'));

const styleTarget = 'packages/webgal/src/Core/gameScripts/choose/choose.module.scss';
const baseStyle = read(styleTarget);
const extension = fs.readFileSync(path.join(sourceRoot, 'choose-timed.scss'), 'utf8');
if (baseStyle.includes('.Choose_timer {')) {
  throw new Error('Timed choice styles already present in pinned WebGAL source.');
}
write(styleTarget, baseStyle.trimEnd() + '\n\n' + extension.trim() + '\n');

console.log('Applied After School timed choice extension to pinned WebGAL source.');
