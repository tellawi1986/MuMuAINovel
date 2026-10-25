/**
 * Application version metadata.
 * Version numbers follow semantic versioning conventions.
 *
 * Note: the version is read from package.json at build time and does not need manual maintenance.
 */

export const VERSION_INFO = {
  // Application version (read from package.json and injected during the build)
  version: import.meta.env.VITE_APP_VERSION || '1.5.7',

  // Build time (injected by Vite during the build)
  buildTime: import.meta.env.VITE_BUILD_TIME || new Date().toISOString().split('T')[0],

  // Project information
  projectName: 'MuMuAINovel',
  projectFullName: 'MuMu AI Novel Writing Assistant',

  // Links
  githubUrl: 'https://github.com/xiamuceer-j/MuMuAINovel',
  linuxDoUrl: 'https://linux.do/t/topic/1106333',

  // License
  license: 'GPL v3.0',
  licenseUrl: 'https://www.gnu.org/licenses/gpl-3.0.html',

  // Author
  author: 'xiamuceer-j',
};

/**
 * Get the formatted version string.
 */
export const getVersionString = () => {
  return `v${VERSION_INFO.version}`;
};

/**
 * Get the full version description.
 */
export const getFullVersionInfo = () => {
  return `${VERSION_INFO.projectName} ${getVersionString()} - Build ${VERSION_INFO.buildTime}`;
};
