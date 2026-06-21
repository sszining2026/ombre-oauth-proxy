const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;
const OMBRE_URL = process.env.OMBRE_URL || 'https://ombre-brain-c3gy.onrender.com';
const PROXY_TOKEN = process.env.PROXY_TOKEN || 'ombre-proxy-token';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

function proxyRequest(req, res, targetUrl) {
  const parsed = url.parse(targetUrl);
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.path,
    method: req.method,
    headers: {
      ...req.headers,
      host: parsed.hostname,
    },
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err);
    res.writeHead(502);
    res.end('Bad gateway');
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (path === '/oauth/authorize') {
    const redirectUri = parsed.query.redirect_uri;
    const state = parsed.query.state || '';
    if (redirectUri) {
      const separator = redirectUri.includes('?') ? '&' : '?';
      const redirectUrl = `${redirectUri}${separator}code=ombre-auth-code&state=${state}`;
      res.writeHead(302, { Location: redirectUrl });
      res.end();
    } else {
      res.writeHead(400);
      res.end('Missing redirect_uri');
    }
    return;
  }

  if (path === '/oauth/token') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      access_token: PROXY_TOKEN,
      token_type: 'bearer',
      expires_in: 86400,
    }));
    return;
  }

  if (path === '/mcp' || path.startsWith('/mcp/')) {
    const targetUrl = `${OMBRE_URL}${path}${parsed.search || ''}`;
    proxyRequest(req, res, targetUrl);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`OAuth proxy running on port ${PORT}`);
  console.log(`Proxying to: ${OMBRE_URL}`);
});
