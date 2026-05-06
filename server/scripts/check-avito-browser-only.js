const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const allowedFile = path.join(srcDir, 'jobs', 'avito-action-runner.service.ts');

const avitoPatterns = [
  'https://www.avito.ru',
  'http://www.avito.ru',
  'avito.ru/web/',
];

const violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.isFile() || !fullPath.endsWith('.ts')) {
      continue;
    }

    if (fullPath === allowedFile) {
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    if (avitoPatterns.some((pattern) => content.includes(pattern))) {
      violations.push(path.relative(rootDir, fullPath));
    }
  }
}

walk(srcDir);

if (violations.length > 0) {
  console.error('Direct Avito backend HTTP usage is only allowed in src/jobs/avito-action-runner.service.ts');
  for (const file of violations) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log('Avito browser-only guard passed.');
