importScripts('./demo-api.js');

const sessions = new Map();
const names = { 200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized', 404: 'Not Found', 405: 'Method Not Allowed', 415: 'Unsupported Media Type', 422: 'Unprocessable Content', 429: 'Too Many Requests', 503: 'Service Unavailable', 504: 'Gateway Timeout' };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type !== 'RESET_DEMO' || !event.source?.id) return;
  sessions.set(event.source.id, CinemaAPI.createSession());
  event.ports[0]?.postMessage({ reset: true });
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./__demo/', self.location.href).pathname)) return;
  event.respondWith(serve(event));
});

async function serve(event) {
  const request = event.request;
  const key = event.clientId || 'uncontrolled';
  if (!sessions.has(key)) sessions.set(key, CinemaAPI.createSession());
  const result = CinemaAPI.handle(sessions.get(key), {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers),
    body: ['GET', 'HEAD'].includes(request.method) ? '' : await request.text()
  });
  await new Promise(resolve => setTimeout(resolve, result.delay));
  // These statuses must have no body, including the JSON string "null".
  const body = [204, 301, 302, 304].includes(result.status) || request.method === 'HEAD' ? null : JSON.stringify(result.data);
  const response = new Response(body, { status: result.status, statusText: names[result.status], headers: result.headers });
  if (sessions.size > 24) {
    const clients = new Set((await self.clients.matchAll()).map(client => client.id));
    for (const id of sessions.keys()) if (!clients.has(id)) sessions.delete(id);
  }
  return response;
}
