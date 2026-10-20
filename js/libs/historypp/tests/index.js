import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runTest(file) {
  console.log(`\nRunning ${file}...`);
  try {
    execSync(`node ${file}`, { stdio: 'inherit' });
    console.log(`${file} passed`);
  } catch {
    console.log(`${file} failed`);
    process.exit(1);
  }
}

function main() {
  const testFiles = fs.readdirSync(__dirname)
    .filter(file => file.endsWith('.test.js'))
    .sort()
    .map(file => path.join(__dirname, file));

  console.log('Starting test suite...\n');

  for (const file of testFiles) {
    runTest(file);
  }

  console.log('\nAll tests completed successfully!');
}

main();