import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.webgal';
const sourceRoot = process.argv[3] ?? 'engine/vn-system';

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
  if (index < 0) throw new Error('WebGAL VN patch target not found: ' + label);
  if (content.indexOf(before, index + before.length) >= 0) {
    throw new Error('WebGAL VN patch target is ambiguous: ' + label);
  }
  return content.slice(0, index) + after + content.slice(index + before.length);
}

write(
  'packages/webgal/src/Core/gameScripts/vn/index.tsx',
  fs.readFileSync(path.join(sourceRoot, 'vn.tsx'), 'utf8'),
);
write(
  'packages/webgal/src/Core/gameScripts/vn/vn.module.scss',
  fs.readFileSync(path.join(sourceRoot, 'vn.module.scss'), 'utf8'),
);

{
  const file = 'packages/webgal/src/Core/controller/scene/sceneInterface.ts';
  let source = read(file);
  source = replaceOnce(
    source,
    '  tech, // 《放学后》技术内容层；继续追加以保持旧指令编号\n}',
    '  tech, // 《放学后》技术内容层；继续追加以保持旧指令编号\n  vn, // 《放学后》开放式 VN 元数据与章节选择\n}',
    'commandType.vn',
  );
  write(file, source);
}

{
  const file = 'packages/parser/src/interface/sceneInterface.ts';
  let source = read(file);
  source = replaceOnce(
    source,
    '  tech, // 《放学后》技术内容层；与引擎枚举保持同序\n}',
    '  tech, // 《放学后》技术内容层；与引擎枚举保持同序\n  vn, // 《放学后》开放式 VN 元数据与章节选择\n}',
    'parser commandType.vn',
  );
  write(file, source);
}

{
  const file = 'packages/webgal/src/Core/parser/sceneParser.ts';
  let source = read(file);
  source = replaceOnce(
    source,
    "import { tech } from '@/Core/gameScripts/tech';",
    "import { tech } from '@/Core/gameScripts/tech';\nimport { vn } from '@/Core/gameScripts/vn';",
    'vn import',
  );
  source = replaceOnce(
    source,
    '  tech: ScriptConfig(commandType.tech, tech, { next: true }),\n});',
    '  tech: ScriptConfig(commandType.tech, tech, { next: true }),\n  vn: ScriptConfig(commandType.vn, vn),\n});',
    'vn script registration',
  );
  write(file, source);
}

console.log('Applied After School open VN registry system to pinned WebGAL source.');
