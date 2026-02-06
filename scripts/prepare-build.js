const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const readerDir = rootDir; 
const resourcesDir = path.join(rootDir, 'resources');

async function main() {
  try {
    // 1. Clean resources dir
    console.log('Cleaning resources directory...');
    await fs.remove(resourcesDir);
    await fs.ensureDir(resourcesDir);

    // 2. Build Frontend
    console.log('Building frontend...');
    execSync('npm run build', { cwd: path.join(readerDir, 'frontend'), stdio: 'inherit' });

    // 3. Copy Frontend Dist
    console.log('Copying frontend dist...');
    await fs.copy(
      path.join(readerDir, 'frontend/dist'),
      path.join(resourcesDir, 'frontend')
    );

    console.log('Build preparation complete!');
  } catch (err) {
    console.error('Build preparation failed:', err);
    process.exit(1);
  }
}

main();
