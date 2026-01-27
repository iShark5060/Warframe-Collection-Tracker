import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const src = 'src/views';
const dst = 'dist/views';

if (!existsSync(src)) {
  throw new Error(`Source directory ${src} does not exist`);
}

function copyRecursive(srcDir, dstDir) {
  if (!existsSync(dstDir)) {
    mkdirSync(dstDir, { recursive: true });
  }

  const entries = readdirSync(srcDir);

  for (const entry of entries) {
    const srcPath = join(srcDir, entry);
    const dstPath = join(dstDir, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyRecursive(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
    }
  }
}

copyRecursive(src, dst);
console.log(`Copied views from ${src} to ${dst}`);

const additionalFiles = ['background.txt', 'favicon.ico'];

for (const file of additionalFiles) {
  const srcPath = file;
  const dstPath = join('dist', file);

  if (existsSync(srcPath)) {
    copyFileSync(srcPath, dstPath);
    console.log(`Copied ${srcPath} to ${dstPath}`);
  } else {
    console.warn(`Warning: ${srcPath} not found, skipping copy`);
  }
}
