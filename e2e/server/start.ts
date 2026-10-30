import { createServer } from 'node:http';

const PORT = 4173;

const server = createServer((req, res) => {
  const path = req.url?.split('?')[0] ?? '/';

  if (path === '/health' || path === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', service: 'source-code-editor-e2e-fixture-server' }));
    return;
  }

  if (path === '/mock-repo') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><head><title>Mock Repository</title></head><body><h1>Mock Repo</h1></body></html>');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`E2E fixture server listening on http://localhost:${PORT}`);
});
