import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Explicit public files: never serve research documents, .env, data, or Git metadata.
const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/docs/design.svg', ['docs/design.svg', 'image/svg+xml']],
  ['/docs/design.png', ['docs/design.png', 'image/png']],
]);
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');

const server = createServer(async (req, res) => {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  };
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { ...headers, Allow: 'GET, HEAD' });
    return res.end('Method not allowed');
  }
  let pathname;
  try {
    pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  } catch {
    res.writeHead(400, headers);
    return res.end('Invalid request path');
  }
  const entry = publicFiles.get(pathname);
  if (!entry) {
    res.writeHead(404, headers);
    return res.end('Not found');
  }
  if (entry[1] === 'image/svg+xml') {
    // This fixed, app-owned SVG contains its own styles, with no scripts or external resources.
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; object-src 'none'; frame-ancestors 'none'; sandbox";
  }
  try {
    const body = await readFile(fileURLToPath(new URL(entry[0], import.meta.url)));
    res.writeHead(200, { ...headers, 'Content-Type': entry[1] });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(500, headers);
    res.end('Could not load preview');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Local Lab preview: http://127.0.0.1:${port}`));
