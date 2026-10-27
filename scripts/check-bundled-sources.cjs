const fs = require('node:fs');
const path = require('node:path');
const mapPath = 'android/app/build/intermediates/sourcemaps/react/release/index.android.bundle.packager.map';
if (!fs.existsSync(mapPath)) { console.log('No release source map yet'); process.exit(0); }
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
let matched = 0; const mismatches = [];
for (let i = 0; i < map.sources.length; i++) {
  const filename = map.sources[i];
  if (filename.includes('node_modules') || !filename.match(/(?:shared|src)[/\\]|App\.tsx$/)) continue;
  const absolute = /^\/(shared|src)\//.test(filename) || filename === "/App.tsx" ? path.resolve(filename.slice(1)) : path.isAbsolute(filename) ? filename : path.resolve(filename);
  if (fs.existsSync(absolute) && map.sourcesContent?.[i] != null) {
    matched++; if (fs.readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n').trimEnd() !== map.sourcesContent[i].replace(/\r\n/g, '\n').trimEnd()) mismatches.push(path.relative(process.cwd(), absolute));
  }
}
console.log(JSON.stringify({ matched, mismatches }));
