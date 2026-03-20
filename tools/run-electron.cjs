const { spawn } = require('node:child_process');
const path = require('node:path');

delete process.env.ELECTRON_RUN_AS_NODE;

const electronExecutable = require('electron');
const projectRoot = path.resolve(__dirname, '..');

const child = spawn(electronExecutable, ['.'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false,
  windowsHide: false,
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
