import express from 'express';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5173;
const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';

const target = new URL(API_URL);
const transport = target.protocol === 'https:' ? https : http;

app.use('/api', (req, res) => {
  const options = {
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: '/api' + req.url,
    method: req.method,
    headers: { ...req.headers, host: target.hostname },
  };

  const proxy = transport.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.status(502).end('Bad Gateway');
  });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxy, { end: true });
  } else {
    proxy.end();
  }
});

app.use(express.static(path.join(__dirname, 'dist/public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Monitor on port ${PORT}, proxying /api/* to ${API_URL}`);
});
