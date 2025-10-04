const { getDefaultConfig } = require('expo/metro-config');
const resolveFrom = require('resolve-from');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('event-target-shim')) {
    const eventTargetShimPath = resolveFrom(
      __dirname,
      'event-target-shim'
    );
    return {
      filePath: eventTargetShimPath,
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
