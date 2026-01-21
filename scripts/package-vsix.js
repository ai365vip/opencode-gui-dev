const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function main() {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = String(pkg.version || '0.0.0');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = `opencode-gui-vscode-${version}-${timestamp}.vsix`;

  const args = ['package', '--no-dependencies', '--allow-missing-repository', '-o', outFile];

  const child =
    process.platform === 'win32'
      ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'vsce', ...args], { stdio: 'inherit' })
      : spawn('vsce', args, { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(typeof code === 'number' ? code : 1));
  child.on('error', (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}

main();
