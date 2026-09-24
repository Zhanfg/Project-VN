import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const gameRoot = process.argv[2] ?? 'game';
const configFile = process.argv[3] ?? 'content/packs/packs.json';
const reportFile = process.argv[4] ?? 'build/resource-report.json';
const runtimeManifestFile = process.argv[5] ?? 'game/runtime/resource-index.json';

const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const generatedRelative = path.relative(gameRoot, runtimeManifestFile).replaceAll('\\', '/');

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (entry.isFile()) output.push(full);
  }
  return output;
}

function globToRegExp(glob) {
  let out = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i += 1;
        if (glob[i + 1] === '/') {
          i += 1;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(out + '$');
}

const compiledPacks = (config.packs ?? []).map((pack) => ({
  ...pack,
  patterns: (pack.include ?? []).map(globToRegExp),
}));

function choosePack(relative) {
  return (
    compiledPacks.find((pack) => pack.patterns.some((pattern) => pattern.test(relative))) ??
    compiledPacks.find((pack) => pack.id === config.fallbackPack) ??
    compiledPacks[0]
  );
}

function kindFor(relative) {
  const ext = path.extname(relative).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg'].includes(ext)) return 'image';
  if (['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.opus'].includes(ext)) return 'audio';
  if (['.mp4', '.webm', '.mkv'].includes(ext)) return 'video';
  if (['.txt', '.json', '.css', '.js', '.mjs', '.html', '.xml'].includes(ext)) return 'text';
  if (['.woff', '.woff2', '.ttf', '.otf'].includes(ext)) return 'font';
  return 'binary';
}

const files = [];
const hashGroups = new Map();

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

for (const full of walk(gameRoot).sort()) {
  const relative = path.relative(gameRoot, full).replaceAll('\\', '/');
  if (relative === generatedRelative || relative.endsWith('/.gitkeep') || relative === '.gitkeep') continue;

  const stat = fs.statSync(full);
  const hash = await sha256File(full);
  const pack = choosePack(relative);
  const item = {
    path: relative,
    size: stat.size,
    sha256: hash,
    kind: kindFor(relative),
    pack: pack?.id ?? config.fallbackPack ?? 'core',
    delivery: pack?.delivery ?? {},
  };
  files.push(item);

  const group = hashGroups.get(hash) ?? [];
  group.push(item);
  hashGroups.set(hash, group);
}

const packs = {};
for (const item of files) {
  const current = packs[item.pack] ?? { bytes: 0, files: 0 };
  current.bytes += item.size;
  current.files += 1;
  packs[item.pack] = current;
}

const duplicates = [...hashGroups.values()]
  .filter((group) => group.length > 1)
  .map((group) => ({
    sha256: group[0].sha256,
    sizeEach: group[0].size,
    wastedBytes: group[0].size * (group.length - 1),
    paths: group.map((item) => item.path),
  }))
  .sort((a, b) => b.wastedBytes - a.wastedBytes);

const shellPackIds = new Set(
  compiledPacks
    .filter((pack) => pack.delivery?.windows === 'shell')
    .map((pack) => pack.id),
);
const embeddedAndroidBytes = files
  .filter((item) => item.delivery?.android === 'embedded')
  .reduce((sum, item) => sum + item.size, 0);
const embeddedCoreBytes = files
  .filter((item) => item.pack === 'core')
  .reduce((sum, item) => sum + item.size, 0);
const windowsShellBytes = files
  .filter((item) => shellPackIds.has(item.pack))
  .reduce((sum, item) => sum + item.size, 0);

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  totals: {
    files: files.length,
    bytes: files.reduce((sum, item) => sum + item.size, 0),
    embeddedAndroidBytes,
    embeddedCoreBytes,
    windowsShellBytes,
  },
  packs,
  duplicates,
  files,
};

const runtimeManifest = {
  version: 1,
  totals: report.totals,
  packs,
  files: files.map(({ path: filePath, size, sha256, kind, pack, delivery }) => ({
    path: filePath,
    size,
    sha256,
    kind,
    pack,
    delivery,
  })),
};

fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.mkdirSync(path.dirname(runtimeManifestFile), { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(runtimeManifestFile, JSON.stringify(runtimeManifest, null, 2) + '\n');

const coreBudget = Number(config.budgets?.embeddedCoreBytes ?? 0);
if (coreBudget > 0 && embeddedCoreBytes > coreBudget) {
  throw new Error(
    'Embedded core budget exceeded: ' + embeddedCoreBytes + ' > ' + coreBudget +
    '. Move large content into a media/chapter pack instead of growing the core.',
  );
}

const duplicateWarning = Number(config.budgets?.duplicateWarningBytes ?? 0);
const expensiveDuplicates = duplicates.filter((item) => item.wastedBytes >= duplicateWarning);
if (expensiveDuplicates.length > 0) {
  console.warn('Large exact duplicate assets detected:');
  for (const item of expensiveDuplicates.slice(0, 20)) {
    console.warn('  ' + item.wastedBytes + ' bytes wasted: ' + item.paths.join(' | '));
  }
}

console.log(
  'Resource audit: ' +
    report.totals.files + ' files, ' +
    report.totals.bytes + ' bytes total, core=' + embeddedCoreBytes +
    ', androidEmbedded=' + embeddedAndroidBytes +
    ', windowsShell=' + windowsShellBytes,
);
