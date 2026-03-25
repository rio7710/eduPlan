const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

function getCandidatePythonExecutables() {
  if (process.env.EDUFIXER_PYTHON_PATH) {
    return [process.env.EDUFIXER_PYTHON_PATH];
  }

  const appPath = app.getAppPath();
  const projectRoot = path.resolve(appPath, '..');
  const candidates = [
    path.join(projectRoot, '.venv', 'Scripts', 'python.exe'),
    path.join(projectRoot, '.venv', 'bin', 'python'),
    path.join(appPath, '.venv', 'Scripts', 'python.exe'),
    path.join(appPath, '.venv', 'bin', 'python'),
    'python',
  ];

  return [...new Set(candidates)];
}

function resolvePythonExecutable() {
  const candidates = getCandidatePythonExecutables();
  return candidates.find((candidate) => candidate === 'python' || fs.existsSync(candidate)) || 'python';
}

function resolveScriptPath(scriptName) {
  return path.join(app.getAppPath(), 'scripts', scriptName);
}

module.exports = {
  getCandidatePythonExecutables,
  resolvePythonExecutable,
  resolveScriptPath,
};
