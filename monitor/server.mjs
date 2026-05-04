import express from 'express';
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5173;
const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';

// Manual proxy for /api/* — avoids all path-stripping issues
app.use('/api', (req, res) => {
  const target = new URL(API_URL);
  const isHttps = target.protocol === 'https:';
  const options = {
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    path: '/api' + req.url,
    method: req.method,
    headers: { ...req.headers, host: target.hostname },
  };
  const proxyReq = (isHttps ? httpsRequest : httpRequest)(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.status(502).end('Bad Gateway');
  });
  req.pipe(proxyReq, { end: true });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'dist/public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Monitor serving on port ${PORT}, proxying API to ${API_URL}`);
});
