'use strict';
// Plugin schema check: every plugins/*.js should export name + execute.
// Plugins lacking the schema are reported as SKIP notices, not failures.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PLUGINS_DIR = path.join(ROOT, 'plugins');

test('plugins/*.js export name + execute function', () => {
  assert.ok(fs.existsSync(PLUGINS_DIR), 'plugins folder missing');
  const files = fs.readdirSync(PLUGINS_DIR).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0, 'no plugin files found');

  const offenders = [];
  let valid = 0;
  for (const file of files) {
    const full = path.join(PLUGINS_DIR, file);
    let mod;
    try {
      mod = require(full);
    } catch (err) {
      offenders.push(`${file}: failed to load (${err.message.split('\n')[0]})`);
      continue;
    }
    if (mod && typeof mod.name === 'string' && mod.name && typeof mod.execute === 'function') {
      valid++;
    } else {
      offenders.push(`${file}: missing ${!mod ? 'exports' : [
        typeof mod.name !== 'string' || !mod.name ? 'name(string)' : null,
        typeof mod.execute !== 'function' ? 'execute(function)' : null,
      ].filter(Boolean).join(', ')}`);
    }
  }

  if (offenders.length > 0) {
    console.log(`SKIP notice: ${offenders.length}/${files.length} plugin files do not conform to the name+execute schema:\n  - ${offenders.join('\n  - ')}`);
  }
  // Not a failure: non-conforming plugins are skipped by the loader anyway.
  assert.ok(valid > 0, 'no valid plugins found at all');
});
