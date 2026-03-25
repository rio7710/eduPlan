const { execFile } = require('node:child_process');
const { createPythonResult } = require('./contracts.cjs');
const { getCandidatePythonExecutables, resolvePythonExecutable, resolveScriptPath } = require('./resolver.cjs');

function runPythonScript(scriptName, args = []) {
  return new Promise((resolve) => {
    const pythonPath = resolvePythonExecutable();
    const scriptPath = resolveScriptPath(scriptName);

    execFile(pythonPath, [scriptPath, ...args], (error, stdout, stderr) => {
      if (error) {
        const isSpawnError = error.code === 'ENOENT';
        const candidateList = getCandidatePythonExecutables()
          .map((candidate) => `- ${candidate}`)
          .join('\n');
        const setupHint = isSpawnError
          ? [
              `Python executable not found for ${scriptName}.`,
              'Create a project virtual environment and install dependencies:',
              'python -m venv .venv',
              '.venv\\Scripts\\python.exe -m pip install --upgrade pip',
              '.venv\\Scripts\\python.exe -m pip install -r requirements.txt',
              'Checked candidates:',
              candidateList,
            ].join('\n')
          : null;

        resolve(createPythonResult({
          ok: false,
          stdout,
          stderr,
          error: setupHint || stderr || error.message,
          scriptName,
        }));
        return;
      }

      resolve(createPythonResult({
        ok: true,
        stdout,
        stderr,
        scriptName,
      }));
    });
  });
}

module.exports = {
  runPythonScript,
};
