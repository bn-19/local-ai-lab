import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Set(['index.html', 'src/app.js', 'src/api.js', 'src/activity.js', 'src/activity-state.js', 'src/dashboard.js', 'src/styles.css', 'favicon.svg', 'assets/halloween/pumpkin.png', 'assets/halloween/ghost.png', 'assets/halloween/pumpkin-icon-v2.png']);
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path === '/' ? 'index.html' : path.slice(1);
  if (!files.has(file)) { res.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(new URL(`../${file}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': types[file.split('.').pop()], 'X-Content-Type-Options': 'nosniff' }).end(body);
  } catch { res.writeHead(500).end('Unable to read app asset'); }
});
server.listen(Number(process.env.PORT || 4174), '127.0.0.1', () => console.log(`Frontend only: http://127.0.0.1:${server.address().port}. Use the companion for real tasks.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
