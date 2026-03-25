function parseJsonSafe(value) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return null;
  }
}

function createPythonResult({ ok, stdout = '', stderr = '', error = null, scriptName = '' }) {
  return {
    ok,
    scriptName,
    stdout,
    stderr,
    json: parseJsonSafe(stdout),
    error: error ? String(error) : null,
  };
}

module.exports = {
  createPythonResult,
  parseJsonSafe,
};
