'use strict';
// Syntax check: every JS entry point and source file must parse.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function collectJsFiles(targets) {
  const files = [];
  for (const t of targets) {
    const abs = path.join(ROOT, t);
    const st = fs.existsSync(abs) ? fs.statSync(abs) : null;
    if (!st) continue;
    if (st.isFile()) files.push(abs);
    else if (st.isDirectory()) {
      for (const f of fs.readdirSync(abs)) {
        if (f.endsWith('.js')) files.push(path.join(abs, f));
      }
    }
  }
  return files;
}

test('all source files pass node --check', () => {
  const files = collectJsFiles(['index.js', 'handler.js', 'config.js', 'lib', 'plugins']);
  assert.ok(files.length > 0, 'no files found to check');
  const failures = [];
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (err) {
      failures.push(`${path.relative(ROOT, file)}: ${err.stderr?.toString().trim()}`);
    }
  }
  assert.deepStrictEqual(failures, [], `syntax errors in:\n${failures.join('\n')}`);
});
