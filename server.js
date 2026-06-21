const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;
const OMBRE_URL = process.env.OMBRE_URL || 'https://ombre-brain-c3gy.onrender.com';
const PROXY_TOKEN = process.env.PROXY_TOKEN || 'ombre-proxy-token';
const BASE_URL = process.env.BASE_URL || 'https://ombre-oauth-proxy.onrender.com';

function proxyRequest(req, res, targetUrl) {
  const parsed = new URL(targetUrl);
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: req.method,
    headers: { ...req.headers, host: parsed.hostname },
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
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const path = parsed.pathname;

  console.log(`${req.method} ${path}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // OAuth discovery
  if (path === '/.well-known/oauth-authorization-server') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      issuer: BASE_URL,
      authorization_endpoint: `${BASE_URL}/oauth/authorize`,
      token_endpoint: `${BASE_URL}/oauth/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
    }));
    return;
  }

  // OAuth authorize
  if (path === '/oauth/authorize') {
    const redirectUri = parsed.searchParams.get('redirect_uri');
    const state = parsed.searchParams.get('state') || '';
    if (redirectUri) {
      const sep = redirectUri.includes('?') ? '&' : '?';
      res.writeHead(302, { Location: `${redirectUri}${sep}code=ombre-auth-code&state=${state}` });
      res.end();
    } else {
      res.writeHead(400);
      res.end('Missing redirect_uri');
    }
    return;
  }

  // OAuth token
  if (path === '/oauth/token') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      access_token: PROXY_TOKEN,
      token_type: 'bearer',
      expires_in: 86400,
    }));
    return;
  }

  // Proxy /mcp
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
