import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5173;
const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';

// Proxy /api/* — mount before static files so requests don't hit the SPA fallback.
// http-proxy-middleware v3: pass pathFilter to avoid Express stripping the prefix.
app.use(
  createProxyMiddleware({
    pathFilter: ['/api'],
    target: API_URL,
    changeOrigin: true,
  })
);

// Serve static files
app.use(express.static(path.join(__dirname, 'dist/public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Monitor serving on port ${PORT}, proxying API to ${API_URL}`);
});
