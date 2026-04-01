const { execFile, spawn } = require('node:child_process');
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

function runPythonScriptStreaming(scriptName, args = [], onStdoutLine) {
  return new Promise((resolve) => {
    const pythonPath = resolvePythonExecutable();
    const scriptPath = resolveScriptPath(scriptName);
    const child = spawn(pythonPath, [scriptPath, ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let stdoutBuffer = '';

    const flushStdoutBuffer = (force = false) => {
      const lines = stdoutBuffer.split(/\r?\n/);
      if (!force) {
        stdoutBuffer = lines.pop() ?? '';
      } else {
        stdoutBuffer = '';
      }
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        onStdoutLine?.(line);
      }
    };

    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      stdout += text;
      stdoutBuffer += text;
      flushStdoutBuffer(false);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      const isSpawnError = error.code === 'ENOENT';
      const candidateList = getCandidatePythonExecutables().map((candidate) => `- ${candidate}`).join('\n');
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
      resolve(createPythonResult({ ok: false, stdout, stderr, error: setupHint || stderr || error.message, scriptName }));
    });
    child.on('close', (code) => {
      flushStdoutBuffer(true);
      resolve(createPythonResult({
        ok: code === 0,
        stdout,
        stderr,
        error: code === 0 ? null : stderr || `python exited with code ${code}`,
        scriptName,
      }));
    });
  });
}

module.exports = {
  runPythonScript,
  runPythonScriptStreaming,
};
