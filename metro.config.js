const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// pdf-lib's tslib 1.x exports map is incompatible with Metro's ESM interop.
// Let Metro select the package's documented main/module entry points.
config.resolver.unstable_enablePackageExports = false;
module.exports = config;
