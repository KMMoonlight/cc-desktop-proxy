import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const buildDir = path.join(rootDir, 'build');
const generatedDir = path.join(buildDir, 'generated');
const iconsetDir = path.join(generatedDir, 'icon.iconset');
const sourceSvgPath = path.join(buildDir, 'icon.svg');
const sourcePngPath = path.join(generatedDir, 'icon-1024.png');
const outputPngPath = path.join(buildDir, 'icon.png');
const outputIcnsPath = path.join(buildDir, 'icon.icns');

if (process.platform !== 'darwin') {
  console.error('build-mac-icon only supports macOS because it relies on qlmanage, sips, and iconutil.');
  process.exit(1);
}

if (!existsSync(sourceSvgPath)) {
  console.error(`Missing source icon: ${path.relative(rootDir, sourceSvgPath)}`);
  process.exit(1);
}

rmSync(generatedDir, { force: true, recursive: true });
mkdirSync(iconsetDir, { recursive: true });

execFileSync('qlmanage', ['-t', '-s', '1024', '-o', generatedDir, sourceSvgPath], {
  stdio: 'ignore',
});

const renderedPngName = readdirSync(generatedDir).find((entry) => entry.toLowerCase().endsWith('.png'));
if (!renderedPngName) {
  console.error('Failed to rasterize build/icon.svg to PNG.');
  process.exit(1);
}

renameSync(path.join(generatedDir, renderedPngName), sourcePngPath);
copyFileSync(sourcePngPath, outputPngPath);

const iconsetSpecs = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

for (const [fileName, size] of iconsetSpecs) {
  execFileSync('sips', ['-z', String(size), String(size), sourcePngPath, '--out', path.join(iconsetDir, fileName)], {
    stdio: 'ignore',
  });
}

execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', outputIcnsPath], {
  stdio: 'ignore',
});

console.log(`Generated ${path.relative(rootDir, outputPngPath)}`);
console.log(`Generated ${path.relative(rootDir, outputIcnsPath)}`);
