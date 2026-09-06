const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'public');
const DEST_DIR = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'www');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('📦 Sincronizando assets de NeveraHub al proyecto Android...');
copyDirRecursive(SRC_DIR, DEST_DIR);
console.log('✅ Assets sincronizados con éxito en android/app/src/main/assets/www/');
