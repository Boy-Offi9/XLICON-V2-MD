'use strict';
// Loader smoke test: replicate index.js's plugin loading logic and assert
// the resulting Map holds a healthy number of commands (> 50).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PLUGIN_FOLDER = './plugins';

test('plugin loader builds a Map with more than 50 entries', () => {
  const plugins = new Map();
  const pluginPath = path.join(ROOT, PLUGIN_FOLDER);
  assert.ok(fs.existsSync(pluginPath), 'plugins folder missing');

  const pluginFiles = fs.readdirSync(pluginPath).filter((file) => file.endsWith('.js'));
  let loadErrors = 0;
  for (const file of pluginFiles) {
    try {
      const plugin = require(path.join(pluginPath, file));
      if (plugin.name && typeof plugin.execute === 'function') {
        plugins.set(plugin.name.toLowerCase(), plugin);
        if (Array.isArray(plugin.aliases)) {
          plugin.aliases.forEach((alias) => plugins.set(alias.toLowerCase(), plugin));
        }
      }
    } catch {
      loadErrors++;
    }
  }

  assert.ok(plugins.size > 50, `expected > 50 plugin entries, got ${plugins.size} (${loadErrors} files failed to load)`);
});
