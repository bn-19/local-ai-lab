import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const files = ['index.html', 'src/app.js', 'src/api.js', 'src/activity.js', 'src/activity-state.js', 'src/dashboard.js', 'src/styles.css', 'favicon.svg', 'assets/halloween/pumpkin.png', 'assets/halloween/ghost.png', 'assets/halloween/pumpkin-icon-v2.png'];
await mkdir(new URL('dist/src/', root), { recursive: true });
await mkdir(new URL('dist/assets/halloween/', root), { recursive: true });
for (const file of files) await copyFile(new URL(file, root), new URL(`dist/${file}`, root));
let revision = process.env.VERCEL_GIT_COMMIT_SHA || 'uncommitted';
try { if (revision === 'uncommitted') revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
await writeFile(new URL('dist/build.json', root), JSON.stringify({ app: 'Local Lab', revision, builtAt: new Date().toISOString() }));
console.log(`Built ${files.length} public files; revision ${revision}`);
