import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.webgal';
const sourceRoot = process.argv[3] ?? 'engine/resource-base';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}
function write(relativePath, content) {
  const full = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
function replaceOnce(content, before, after, label) {
  const index = content.indexOf(before);
  if (index < 0) throw new Error('WebGAL resource-base patch target not found: ' + label);
  if (content.indexOf(before, index + before.length) >= 0) {
    throw new Error('WebGAL resource-base patch target is ambiguous: ' + label);
  }
  return content.slice(0, index) + after + content.slice(index + before.length);
}

write(
  'packages/webgal/src/Core/util/gameAssetsAccess/resourceBase.ts',
  fs.readFileSync(path.join(sourceRoot, 'resourceBase.ts'), 'utf8'),
);

{
  const file = 'packages/webgal/src/Core/util/gameAssetsAccess/assetSetter.ts';
  let source = read(file);
  source = source.replace(
    '/**\n * 内置资源类型的枚举',
    "import { gamePath } from './resourceBase';\n\n/**\n * 内置资源类型的枚举",
  );
  const mappings = [
    ['`./game/background/${fileName}`', 'gamePath(`background/${fileName}`)'],
    ['`./game/scene/${fileName}`', 'gamePath(`scene/${fileName}`)'],
    ['`./game/vocal/${fileName}`', 'gamePath(`vocal/${fileName}`)'],
    ['`./game/figure/${fileName}`', 'gamePath(`figure/${fileName}`)'],
    ['`./game/bgm/${fileName}`', 'gamePath(`bgm/${fileName}`)'],
    ['`./game/video/${fileName}`', 'gamePath(`video/${fileName}`)'],
  ];
  for (const [before, after] of mappings) {
    source = replaceOnce(source, before, after, 'assetSetter ' + before);
  }
  write(file, source);
}

{
  const file = 'packages/webgal/src/Core/initializeScript.ts';
  let source = read(file);
  source = replaceOnce(
    source,
    "import { autoFastSaveGame } from './controller/storage/fastSaveLoad';",
    "import { autoFastSaveGame } from './controller/storage/fastSaveLoad';\nimport { gamePath } from './util/gameAssetsAccess/resourceBase';",
    'initialize gamePath import',
  );
  source = replaceOnce(source, "loadStyle('./game/userStyleSheet.css');", "loadStyle(gamePath('userStyleSheet.css'));", 'user stylesheet');
  source = replaceOnce(source, "infoFetcher('./game/config.txt');", "infoFetcher(gamePath('config.txt'));", 'config path');
  source = replaceOnce(
    source,
    "axios.get('./game/animation/animationTable.json')",
    "axios.get(gamePath('animation/animationTable.json'))",
    'animation table',
  );
  source = replaceOnce(
    source,
    'axios.get(`./game/animation/${animationName}.json`)',
    'axios.get(gamePath(`animation/${animationName}.json`))',
    'animation item',
  );
  write(file, source);
}

{
  const file = 'packages/webgal/src/Core/util/coreInitialFunction/templateLoader.ts';
  let source = read(file);
  source = replaceOnce(
    source,
    "import { injectGlobal } from '@emotion/css';",
    "import { injectGlobal } from '@emotion/css';\nimport { gamePath } from '@/Core/util/gameAssetsAccess/resourceBase';",
    'template gamePath import',
  );
  source = replaceOnce(
    source,
    "const TEMPLATE_PATH = './game/template/template.json';",
    "const TEMPLATE_PATH = gamePath('template/template.json');",
    'template path',
  );
  source = replaceOnce(
    source,
    'return `./game/template/${normalized}`;',
    'return gamePath(`template/${normalized}`);',
    'template asset',
  );
  source = replaceOnce(
    source,
    'axios.get(`game/template/${templatePath.path}`)',
    'axios.get(gamePath(`template/${templatePath.path}`))',
    'template style',
  );
  write(file, source);
}

{
  const file = 'packages/webgal/src/Core/Modules/flowchart.ts';
  let source = read(file);
  source = replaceOnce(
    source,
    "import localforage from 'localforage';",
    "import localforage from 'localforage';\nimport { gamePath } from '@/Core/util/gameAssetsAccess/resourceBase';",
    'flowchart gamePath import',
  );
  source = replaceOnce(
    source,
    "axios.get('./game/flowchart.json')",
    "axios.get(gamePath('flowchart.json'))",
    'flowchart path',
  );
  write(file, source);
}

console.log('Applied relocatable game resource base to pinned WebGAL source.');
