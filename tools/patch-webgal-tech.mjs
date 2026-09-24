import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.webgal';
const sourceRoot = process.argv[3] ?? 'engine/technical-layer';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function write(relativePath, content) {
  const full = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function copy(sourceName, targetPath) {
  write(targetPath, fs.readFileSync(path.join(sourceRoot, sourceName), 'utf8'));
}

function replaceOnce(content, before, after, label) {
  const index = content.indexOf(before);
  if (index < 0) throw new Error('WebGAL tech patch target not found: ' + label);
  if (content.indexOf(before, index + before.length) >= 0) {
    throw new Error('WebGAL tech patch target is ambiguous: ' + label);
  }
  return content.slice(0, index) + after + content.slice(index + before.length);
}

copy('TechnicalLayer.tsx', 'packages/webgal/src/Stage/TechnicalLayer/TechnicalLayer.tsx');
copy('TechnicalLayer.module.scss', 'packages/webgal/src/Stage/TechnicalLayer/TechnicalLayer.module.scss');
copy('tech.ts', 'packages/webgal/src/Core/gameScripts/tech.ts');

{
  const file = 'packages/webgal/src/Core/controller/scene/sceneInterface.ts';
  let source = read(file);
  source = replaceOnce(
    source,
    '  changeFigureDiff, // 切换等尺寸静态立绘差分；追加以保持旧指令编号\n}',
    '  changeFigureDiff, // 切换等尺寸静态立绘差分；追加以保持旧指令编号\n  tech, // 《放学后》技术内容层；继续追加以保持旧指令编号\n}',
    'commandType.tech',
  );
  write(file, source);
}

{
  const file = 'packages/webgal/src/Core/Modules/stage/stageInterface.ts';
  let source = read(file);
  const technicalInterface = [
    'export interface ITechnicalViewState {',
    '  visible: boolean;',
    "  kind: 'code' | 'terminal' | 'algorithm' | 'plot' | 'diagram';",
    '  src: string;',
    '  title: string;',
    "  placement: 'left' | 'right' | 'center' | 'full';",
    '  step: number;',
    '}',
    '',
    '/**',
    ' * @interface IStageState 游戏舞台数据接口',
    ' */',
    'export interface IStageState {',
  ].join('\n');

  source = replaceOnce(
    source,
    '/**\n * @interface IStageState 游戏舞台数据接口\n */\nexport interface IStageState {',
    technicalInterface,
    'ITechnicalViewState',
  );
  source = replaceOnce(
    source,
    '  replacedUIlable: Record<string, string>;\n  figureMetaData: figureMetaData;',
    '  replacedUIlable: Record<string, string>;\n  technicalView: ITechnicalViewState;\n  figureMetaData: figureMetaData;',
    'IStageState.technicalView',
  );
  write(file, source);
}

{
  const file = 'packages/webgal/src/Core/Modules/stage/stageStateManager.ts';
  let source = read(file);
  const value = [
    '  replacedUIlable: {},',
    '  technicalView: {',
    '    visible: false,',
    "    kind: 'code',",
    "    src: '',",
    "    title: '',",
    "    placement: 'right',",
    '    step: 0,',
    '  },',
    '  figureMetaData: {},',
  ].join('\n');

  source = replaceOnce(
    source,
    '  replacedUIlable: {},\n  figureMetaData: {},',
    value,
    'initState.technicalView',
  );
  write(file, source);
}

{
  const file = 'packages/webgal/src/Core/parser/sceneParser.ts';
  let source = read(file);
  source = replaceOnce(
    source,
    "import { wait } from '@/Core/gameScripts/wait';",
    "import { wait } from '@/Core/gameScripts/wait';\nimport { tech } from '@/Core/gameScripts/tech';",
    'tech import',
  );
  source = replaceOnce(
    source,
    '  return: ScriptConfig(commandType.return, returnScript),\n});',
    '  return: ScriptConfig(commandType.return, returnScript),\n  tech: ScriptConfig(commandType.tech, tech, { next: true }),\n});',
    'tech script registration',
  );
  write(file, source);
}

{
  const file = 'packages/webgal/src/Stage/Stage.tsx';
  let source = read(file);
  source = replaceOnce(
    source,
    "import { useStageState } from '@/hooks/useStageState';",
    "import { useStageState } from '@/hooks/useStageState';\nimport { TechnicalLayer } from '@/Stage/TechnicalLayer/TechnicalLayer';",
    'TechnicalLayer import',
  );
  source = replaceOnce(
    source,
    '      <FullScreenPerform />\n      {/* 已弃用旧的立绘与背景舞台 */}',
    '      <FullScreenPerform />\n      <TechnicalLayer />\n      {/* 已弃用旧的立绘与背景舞台 */}',
    'TechnicalLayer mount',
  );
  write(file, source);
}

console.log('Applied After School technical presentation layer to pinned WebGAL source.');
