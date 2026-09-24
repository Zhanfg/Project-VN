import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? 'game/scene';
let checked = 0;
let failed = false;

function collect(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, output);
    else if (entry.isFile() && entry.name.endsWith('.txt')) output.push(full);
  }
  return output;
}

function countOptions(content) {
  let count = 1;
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '|' && (i === 0 || content[i - 1] !== '\\')) count += 1;
  }
  return content.trim() ? count : 0;
}

for (const file of collect(root)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.includes('choose:')) return;

    const timeoutMatch = line.match(/(?:^|\s)-timeout=([0-9]+(?:\.[0-9]+)?)/);
    const timeoutChooseMatch = line.match(/(?:^|\s)-timeoutChoose=([0-9]+)/);
    if (!timeoutMatch && !timeoutChooseMatch) return;

    checked += 1;
    const lineNumber = index + 1;

    if (!timeoutMatch || !timeoutChooseMatch) {
      console.error(file + ':' + lineNumber + ': timed choice requires both -timeout and -timeoutChoose');
      failed = true;
      return;
    }

    const timeout = Number(timeoutMatch[1]);
    const timeoutChoose = Number(timeoutChooseMatch[1]);

    if (!Number.isFinite(timeout) || timeout <= 0) {
      console.error(file + ':' + lineNumber + ': -timeout must be a positive number of seconds');
      failed = true;
    }

    const optionStart = line.indexOf('choose:') + 'choose:'.length;
    const optionEndCandidates = [
      line.indexOf(' -timeout=', optionStart),
      line.indexOf(' -timeoutChoose=', optionStart),
      line.indexOf(' -defaultChoose=', optionStart),
    ].filter((value) => value >= 0);
    const optionEnd = optionEndCandidates.length > 0 ? Math.min(...optionEndCandidates) : line.lastIndexOf(';');
    const optionContent = line.slice(optionStart, optionEnd >= 0 ? optionEnd : undefined);
    const optionCount = countOptions(optionContent);

    if (!Number.isInteger(timeoutChoose) || timeoutChoose < 1 || timeoutChoose > optionCount) {
      console.error(
        file +
          ':' +
          lineNumber +
          ': -timeoutChoose=' +
          timeoutChoose +
          ' is outside 1..' +
          optionCount,
      );
      failed = true;
    }
  });
}

if (failed) process.exit(1);
console.log('Timed choice validation passed: ' + checked + ' timed choice(s).');
