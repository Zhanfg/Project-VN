import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.webgal';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content);
}

function replaceOnce(content, before, after, label) {
  const index = content.indexOf(before);
  if (index < 0) {
    throw new Error('WebGAL patch target not found: ' + label);
  }
  if (content.indexOf(before, index + before.length) >= 0) {
    throw new Error('WebGAL patch target is ambiguous: ' + label);
  }
  return content.slice(0, index) + after + content.slice(index + before.length);
}

// 1) Load the pinned offline KaTeX runtime before the WebGAL application starts.
{
  const file = 'packages/webgal/index.html';
  let source = read(file);
  const before = '    <link rel="manifest" href="/manifest.json" />\n    <title>WebGAL</title>';
  const after =
    '    <link rel="manifest" href="/manifest.json" />\n' +
    '    <link rel="stylesheet" href="./game/vendor/katex/katex.min.css" />\n' +
    '    <script src="./game/vendor/katex/katex.min.js"></script>\n' +
    '    <title>WebGAL</title>';
  source = replaceOnce(source, before, after, 'index.html KaTeX loader');
  write(file, source);
}

// 2) Teach the standard WebGAL text compiler about atomic math nodes.
{
  const file = 'packages/webgal/src/Stage/TextBox/TextBox.tsx';
  let source = read(file);

  source = replaceOnce(
    source,
    'export interface EnhancedNode {\n  reactNode: ReactNode;\n  enhancedValue?: { key: string; value: string }[];\n}',
    'export interface EnhancedNode {\n  reactNode: ReactNode;\n  enhancedValue?: { key: string; value: string }[];\n  isAtomic?: boolean;\n}',
    'EnhancedNode.isAtomic',
  );

  source = replaceOnce(
    source,
    "  // 先拆行\n  const lines = sentence.split(/(?<!\\\\)\\|/).map((val: string) => useEscape(val));",
    "  // 先拆行，但公式内部的 | 必须保持为数学符号。\n  const lines = splitDialogLines(sentence);",
    'math-aware line split',
  );

  source = replaceOnce(
    source,
    "        .with(SegmentType.String, () => {\n          const chars = splitChars(node.value as string, replace_space_with_nbsp);\n          // eslint-disable-next-line max-nested-callbacks\n          ln.push(...chars.map((c) => ({ reactNode: c })));\n        })\n        .endsWith(SegmentType.Link, () => {",
    "        .with(SegmentType.String, () => {\n          const chars = splitChars(useEscape(node.value as string), replace_space_with_nbsp);\n          // eslint-disable-next-line max-nested-callbacks\n          ln.push(...chars.map((c) => ({ reactNode: c })));\n        })\n        .with(SegmentType.Math, () => {\n          const value = node.value as MathValue;\n          ln.push({\n            reactNode: renderMath(value.tex, value.displayMode),\n            isAtomic: true,\n          });\n        })\n        .endsWith(SegmentType.Link, () => {",
    'compile math segment',
  );

  source = replaceOnce(
    source,
    "enum SegmentType {\n  String = 'SegmentType.String',\n  Link = 'SegmentType.Link',\n}",
    "enum SegmentType {\n  String = 'SegmentType.String',\n  Link = 'SegmentType.Link',\n  Math = 'SegmentType.Math',\n}",
    'SegmentType.Math',
  );

  source = replaceOnce(
    source,
    "interface Segment {\n  type: SegmentType;\n  value?: string | EnhancedValue;\n}",
    "interface MathValue {\n  tex: string;\n  displayMode: boolean;\n}\n\ninterface Segment {\n  type: SegmentType;\n  value?: string | EnhancedValue | MathValue;\n}",
    'MathValue',
  );

  const start = source.indexOf('function parseString(input: string): Segment[] {');
  const end = source.indexOf('interface KeyValuePair {', start);
  if (start < 0 || end < 0) {
    throw new Error('WebGAL patch target not found: parseString block');
  }

  const replacement = [
    "function renderMath(tex: string, displayMode: boolean): ReactNode {",
    "  const runtime = (window as any).katex;",
    "  const className = displayMode ? 'after-school-math after-school-math--display' : 'after-school-math';",
    "  if (!runtime?.renderToString) {",
    "    return <span className={className + ' after-school-math--fallback'}>{tex}</span>;",
    "  }",
    "  const html = runtime.renderToString(tex, {",
    "    displayMode,",
    "    throwOnError: false,",
    "    strict: false,",
    "    trust: false,",
    "    output: 'htmlAndMathml',",
    "  });",
    "  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;",
    "}",
    "",
    "function splitDialogLines(input: string): string[] {",
    "  const result: string[] = [];",
    "  let buffer = '';",
    "  let inMath = false;",
    "",
    "  for (let i = 0; i < input.length; i += 1) {",
    "    if (input.startsWith('<math display>', i) || input.startsWith('<math>', i)) {",
    "      inMath = true;",
    "    } else if (input.startsWith('</math>', i)) {",
    "      inMath = false;",
    "    }",
    "",
    "    const current = input[i];",
    "    const escaped = i > 0 && input[i - 1] === '\\\\';",
    "    if (current === '|' && !inMath && !escaped) {",
    "      result.push(buffer);",
    "      buffer = '';",
    "      continue;",
    "    }",
    "    buffer += current;",
    "  }",
    "  result.push(buffer);",
    "  return result;",
    "}",
    "",
    "function parseRichText(input: string): Segment[] {",
    "  const regex = /(\\[([^\\]]+)\\]\\(([^)]+)\\))|([\\s\\S]+?(?=\\[|$))/g;",
    "  const result: Segment[] = [];",
    "  let match: RegExpExecArray | null;",
    "",
    "  while ((match = regex.exec(input)) !== null) {",
    "    if (match[1]) {",
    "      const text = useEscape(match[2]);",
    "      const enhance = useEscape(match[3]);",
    "      let parsedEnhanced: KeyValuePair[] = [];",
    "      let ruby = '';",
    "      if (enhance.match(/style=|tips=|ruby=|style-alltext=/)) {",
    "        parsedEnhanced = parseEnhancedString(enhance);",
    "        const rubyKvPair = parsedEnhanced.find((e) => e.key === 'ruby');",
    "        if (rubyKvPair) ruby = rubyKvPair.value;",
    "      } else {",
    "        ruby = enhance;",
    "      }",
    "      result.push({ type: SegmentType.Link, value: { text, ruby, values: parsedEnhanced } });",
    "    } else {",
    "      result.push({ type: SegmentType.String, value: match[0] });",
    "    }",
    "  }",
    "  return result;",
    "}",
    "",
    "function parseString(input: string): Segment[] {",
    "  const result: Segment[] = [];",
    "  const mathRegex = /<math( display)?>([\\s\\S]*?)<\\/math>/g;",
    "  let cursor = 0;",
    "  let mathMatch: RegExpExecArray | null;",
    "",
    "  while ((mathMatch = mathRegex.exec(input)) !== null) {",
    "    if (mathMatch.index > cursor) {",
    "      result.push(...parseRichText(input.slice(cursor, mathMatch.index)));",
    "    }",
    "    result.push({",
    "      type: SegmentType.Math,",
    "      value: { tex: mathMatch[2].trim(), displayMode: Boolean(mathMatch[1]) },",
    "    });",
    "    cursor = mathRegex.lastIndex;",
    "  }",
    "",
    "  if (cursor < input.length) {",
    "    result.push(...parseRichText(input.slice(cursor)));",
    "  }",
    "",
    "  result.unshift({ type: SegmentType.String, value: '' });",
    "  return result;",
    "}",
    "",
  ].join('\n');

  source = source.slice(0, start) + replacement + source.slice(end);
  write(file, source);
}

// 3) Atomic nodes are rendered once, instead of through WebGAL's three text-stroke layers.
{
  const file = 'packages/webgal/src/Stage/TextBox/IMSSTextbox.tsx';
  let source = read(file);
  const before =
    "      const duration =\n" +
    "        textRevealEnd === undefined ? textDuration : Math.min(textDuration, Math.max(0, textRevealEnd - delay));\n" +
    "      const styleClassName = ' ' + css(style);";

  const after =
    "      const duration =\n" +
    "        textRevealEnd === undefined ? textDuration : Math.min(textDuration, Math.max(0, textRevealEnd - delay));\n" +
    "      if (en.isAtomic) {\n" +
    "        const className = isConcatPrefix\n" +
    "          ? applyStyle('TextBox_textElement_Settled', styles.TextBox_textElement_Settled) + readTextClassName\n" +
    "          : applyStyle('TextBox_textElement_start', styles.TextBox_textElement_start) +\n" +
    "            readTextClassName +\n" +
    "            ' Textelement_start';\n" +
    "        return (\n" +
    "          <span\n" +
    "            id={String(delay)}\n" +
    "            className={className}\n" +
    "            key={currentDialogKey + 'atomic-' + index}\n" +
    "            style={{\n" +
    "              animationDelay: String(delay) + 'ms',\n" +
    "              animationDuration: String(isConcatPrefix ? textDuration : duration) + 'ms',\n" +
    "              position: 'relative',\n" +
    "            }}\n" +
    "          >\n" +
    "            {e}\n" +
    "          </span>\n" +
    "        );\n" +
    "      }\n" +
    "      const styleClassName = ' ' + css(style);";

  source = replaceOnce(source, before, after, 'IMSSTextbox atomic renderer');
  write(file, source);
}

console.log('Applied After School math extensions to pinned WebGAL source.');
