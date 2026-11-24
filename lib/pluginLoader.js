const fs = require('fs');
const path = require('path');

const PLUGIN_FOLDER = './plugins';

function loadPlugins() {
    const plugins = new Map();
    const pluginPath = path.join(__dirname, '..', PLUGIN_FOLDER);

    if (!fs.existsSync(pluginPath)) {
        console.log('No plugins folder found');
        return plugins;
    }

    const pluginFiles = fs.readdirSync(pluginPath).filter(file => path.extname(file).toLowerCase() === '.js');
    for (const file of pluginFiles) {
        try {
            const plugin = require(path.join(pluginPath, file));
            if (plugin.name && typeof plugin.execute === 'function') {
                plugins.set(plugin.name.toLowerCase(), plugin);
                if (Array.isArray(plugin.aliases)) {
                    plugin.aliases.forEach(alias => {
                        plugins.set(alias.toLowerCase(), plugin);
                    });
                }
                console.log(`Loaded plugin: ${plugin.name}`);
            } else {
                console.warn(`Invalid plugin structure in ${file}`);
            }
        } catch (error) {
            console.error(`Failed to load plugin ${file}:`, error.message);
        }
    }
    console.log(`Total plugins loaded: ${plugins.size}`);
    return plugins;
}

function reloadPlugins(plugins) {
    // Clear only plugin module entries from the require cache
    const pluginPath = path.join(__dirname, '..', PLUGIN_FOLDER);
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(pluginPath + path.sep) && key.endsWith('.js')) {
            delete require.cache[key];
        }
    }
    const fresh = loadPlugins();
    plugins.clear();
    for (const [k, v] of fresh) plugins.set(k, v);
    return plugins;
}

module.exports = { loadPlugins, reloadPlugins, PLUGIN_FOLDER };
