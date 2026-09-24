import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [katexModulePath, rootPath = 'game/scene'] = process.argv.slice(2);
if (!katexModulePath) {
  console.error('Usage: node validate-math.mjs <katex.mjs> [scene-root]');
  process.exit(2);
}

const katexModule = await import(pathToFileURL(path.resolve(katexModulePath)).href);
const katex = katexModule.default ?? katexModule;

function listFiles(root) {
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...listFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.txt')) output.push(full);
  }
  return output;
}

let failed = false;
let formulaCount = 0;

for (const file of listFiles(rootPath)) {
  const source = fs.readFileSync(file, 'utf8');
  const openCount = (source.match(/<math(?: display)?>/g) ?? []).length;
  const closeCount = (source.match(/<\/math>/g) ?? []).length;
  if (openCount !== closeCount) {
    console.error(`${file}: math tag count mismatch (open=${openCount}, close=${closeCount})`);
    failed = true;
  }

  const regex = /<math( display)?>([\s\S]*?)<\/math>/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    formulaCount += 1;
    const tex = match[2].trim();
    const line = source.slice(0, match.index).split('\n').length;
    try {
      katex.renderToString(tex, {
        displayMode: Boolean(match[1]),
        throwOnError: true,
        strict: 'error',
        trust: false,
        output: 'htmlAndMathml',
      });
    } catch (error) {
      console.error(`${file}:${line}: invalid TeX: ${error.message}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log(`Math validation passed: ${formulaCount} formula(s).`);
