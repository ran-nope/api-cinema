(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined') module.exports = api;
  else root.CinemaAPI = api;
})(globalThis, function () {
  const films = ['Arrival', 'Moonlight', 'Moonrise Kingdom', 'The Farewell', 'Past Lives', 'Aftersun', 'Perfect Days', 'The Lunchbox', 'Portrait of a Lady on Fire', 'The Grand Budapest Hotel', 'Cinema Paradiso', 'The Red Turtle'];
  const profile = { id: 1, name: 'Alex Morgan', role: 'developer' };

  function createSession() {
    return { projects: new Map(), nextId: 104, rateCalls: 0, rateReset: 0, flakyCalls: 0, freshToken: null };
  }

  function respond(status, data = null, headers = {}, delay = 120) {
    return { status, data, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }, delay };
  }

  function handle(session, request, now = Date.now()) {
    const url = new URL(request.url, 'https://demo.invalid');
    const path = url.pathname.includes('/__demo/') ? '/' + url.pathname.split('/__demo/')[1] : url.pathname;
    const method = request.method || 'GET';
    const headers = new Headers(request.headers);
    const json = () => JSON.parse(request.body || '');
    const fail = (status, error, message, extra = {}) => respond(status, { error, message, ...extra });
    const only = allowed => respond(405, { error: 'method_not_allowed', message: `Use ${allowed}.` }, { Allow: allowed });
    const isJSON = () => (headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() === 'application/json';

    if (path === '/projects' || /^\/projects\/\d+$/.test(path)) {
      const id = Number(path.split('/')[2]);
      if (path === '/projects') {
        if (method === 'GET') return respond(200, { projects: [...session.projects.values()] });
        if (method !== 'POST') return respond(405, { error: 'method_not_allowed', message: 'Use GET or POST.' }, { Allow: 'GET, POST' });
        if (!isJSON()) return fail(415, 'unsupported_media_type', 'Send Content-Type: application/json.');
        let data;
        try { data = json(); } catch { return fail(400, 'invalid_json', 'The request body is not valid JSON.'); }
        if (!data || typeof data.name !== 'string' || !data.name.trim()) return fail(422, 'validation_failed', 'A project needs a name.', { errors: { name: 'Enter a non-empty name.' } });
        const project = { id: session.nextId++, name: data.name.trim(), created: true };
        session.projects.set(project.id, project);
        return respond(201, project, { Location: `projects/${project.id}` });
      }
      if (!['GET', 'DELETE'].includes(method)) return respond(405, { error: 'method_not_allowed' }, { Allow: 'GET, DELETE' });
      if (!session.projects.has(id)) return fail(404, 'not_found', 'This project does not exist.');
      if (method === 'DELETE') { session.projects.delete(id); return respond(204); }
      return respond(200, session.projects.get(id));
    }

    if (path === '/refresh') {
      if (method !== 'POST') return only('POST');
      let body;
      try { body = json(); } catch { return fail(400, 'invalid_json', 'Send a JSON refresh_token.'); }
      if (!isJSON()) return fail(415, 'unsupported_media_type', 'Send JSON.');
      if (body?.refresh_token !== 'refresh-demo') return fail(401, 'invalid_refresh_token', 'The demo refresh token is refresh-demo.');
      session.freshToken = 'cinema-fresh';
      return respond(200, { access_token: session.freshToken, token_type: 'Bearer' });
    }

    if (path === '/screening' || path === '/tickets') {
      if (method !== 'POST') return only('POST');
      if (!isJSON()) return fail(415, 'unsupported_media_type', 'This endpoint only accepts application/json.');
      let body;
      try { body = json(); } catch { return fail(400, 'invalid_json', 'Check the JSON syntax.'); }
      const errors = {};
      if (path === '/tickets') {
        if (typeof body?.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) errors.email = 'Enter a valid email address.';
        if (!Number.isInteger(body?.seats) || body.seats < 1 || body.seats > 6) errors.seats = 'Choose an integer from 1 to 6.';
      } else if (typeof body?.film !== 'string' || !body.film.trim()) errors.film = 'Choose a film.';
      if (Object.keys(errors).length) return fail(422, 'validation_failed', 'The JSON is readable, but some fields are wrong.', { errors });
      return respond(201, { ...body, booked: true });
    }

    if (method !== 'GET') return respond(405, { error: 'method_not_allowed', message: 'Use GET.' }, { Allow: 'GET' });
    if (path === '/private' || path === '/session') {
      const token = path === '/private' ? 'cinema-demo' : session.freshToken;
      if (!token || headers.get('Authorization') !== `Bearer ${token}`) return fail(401, 'unauthorized', path === '/session' ? 'The access token has expired. POST /refresh with refresh_token: refresh-demo.' : 'Send Authorization: Bearer cinema-demo.');
      return respond(200, { ...profile, access: 'granted' });
    }
    if (path === '/search') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      if (!q) return fail(400, 'missing_query', 'Use a q query parameter, for example ?q=moon.');
      return respond(200, { query: q, films: films.filter(name => name.toLowerCase().includes(q)) });
    }
    if (path === '/catalog') {
      const page = Number(url.searchParams.get('page') || 1);
      const size = Number(url.searchParams.get('limit') || 3);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(size) || size < 1 || size > 6) return fail(422, 'invalid_pagination', 'page must be positive; limit must be between 1 and 6.');
      const start = (page - 1) * size;
      const next = start + size < films.length ? `/catalog?page=${page + 1}&limit=${size}` : null;
      return respond(200, { page, limit: size, total: films.length, films: films.slice(start, start + size).map((name, i) => ({ id: start + i + 1, name })), next });
    }
    if (path === '/legacy' || path === '/temporary') {
      const target = new URL('users/1', url);
      return respond(path === '/legacy' ? 301 : 302, null, { Location: target.href });
    }
    if (path === '/poster') {
      const etag = '"poster-v1"';
      if (headers.get('If-None-Match') === etag) return respond(304, null, { ETag: etag, 'Cache-Control': 'private, max-age=0' });
      return respond(200, { title: 'Arrival', edition: 1 }, { ETag: etag, 'Cache-Control': 'private, max-age=0' });
    }
    if (path === '/limited') {
      if (!session.rateReset || now >= session.rateReset) { session.rateReset = now + 4000; session.rateCalls = 0; }
      session.rateCalls++;
      if (session.rateCalls > 3) return respond(429, { error: 'rate_limit_exceeded', message: 'Wait for Retry-After before sending again.' }, { 'Retry-After': String(Math.max(1, Math.ceil((session.rateReset - now) / 1000))) });
      return respond(200, { admitted: true, remaining: Math.max(0, 3 - session.rateCalls) });
    }
    if (path === '/flaky') {
      session.flakyCalls++;
      return session.flakyCalls <= 2 ? respond(503, { error: 'temporarily_unavailable', attempt: session.flakyCalls }, { 'Retry-After': '1' }) : respond(200, { recovered: true, attempt: session.flakyCalls });
    }
    if (path === '/slow') return url.searchParams.has('broken') ? respond(504, { error: 'gateway_timeout' }, {}, 3000) : respond(200, { report: 'Weekly activity', completed: true }, {}, 2300);
    if (path === '/users/1' && !url.searchParams.has('broken')) return respond(200, profile);
    return fail(404, 'not_found', 'No resource exists here. Try /users/1.');
  }
  return { createSession, handle };
});
