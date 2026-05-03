import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5173;
const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';

// Proxy API requests
app.use('/api', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api': '/api', // Keep /api prefix
  },
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'dist/public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Monitor serving on port ${PORT}, proxying to ${API_URL}`);
});
