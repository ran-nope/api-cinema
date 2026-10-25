const test = require('node:test');
const assert = require('node:assert/strict');
const { createSession, handle } = require('./dist/demo-api.js');
const { challenges, assess } = require('./dist/challenge-rules.js');
const tools = require('./dist/request-tools.js');

function harness() {
  const session = createSession();
  let clock = 10000;
  function send(path, method = 'GET', data, headers = {}, options = {}) {
    const request = { url: 'demo://api' + path, method, body: data === undefined ? '' : typeof data === 'string' ? data : JSON.stringify(data), headers: { 'Content-Type': 'application/json', ...headers }, redirect: options.redirect || 'follow', startedAt: clock, broken: false };
    const result = handle(session, { ...request, url: 'https://demo.invalid' + path }, clock);
    const response = { ...result, text: [204, 301, 302, 304].includes(result.status) ? '' : JSON.stringify(result.data), receivedAt: clock + result.delay, redirected: false, finalURL: 'https://demo.invalid' + path };
    clock += result.delay + 20;
    return { request, response };
  }
  return { session, send, wait(ms) { clock += ms; } };
}

test('POST persists, list and GET read it, DELETE removes it', () => {
  const { send } = harness();
  const created = send('/projects', 'POST', { name: 'First cut', id: 1 });
  assert.equal(created.response.status, 201);
  assert.equal(created.response.data.id, 104);
  assert.equal(send('/projects').response.data.projects.length, 1);
  assert.equal(send('/projects/104').response.data.name, 'First cut');
  assert.equal(send('/projects/104', 'DELETE').response.status, 204);
  assert.equal(send('/projects/104').response.status, 404);
  assert.equal(send('/projects/104', 'DELETE').response.status, 404);
});

test('separate sessions and a new session start with no projects', () => {
  const first = harness(), second = harness();
  first.send('/projects', 'POST', { name: 'Mine' });
  assert.equal(second.send('/projects').response.data.projects.length, 0);
  assert.equal(handle(createSession(), { url: '/projects' }).data.projects.length, 0);
});

test('bad methods, Content-Type, malformed JSON and field errors differ', () => {
  const { send } = harness();
  assert.equal(send('/users/1', 'DELETE').response.status, 405);
  assert.equal(send('/projects', 'PUT', {}).response.status, 405);
  assert.equal(send('/projects', 'POST', {}, { 'Content-Type': 'text/plain' }).response.status, 415);
  assert.equal(send('/projects', 'POST', '{').response.status, 400);
  assert.equal(send('/projects', 'POST', { name: '  ' }).response.status, 422);
  assert.equal(send('/tickets', 'POST', null).response.status, 422);
  assert.deepEqual(Object.keys(send('/tickets', 'POST', { email: 'x', seats: 0 }).response.data.errors), ['email', 'seats']);
});

test('query and pagination read actual URL parameters', () => {
  const { send } = harness();
  assert.equal(send('/search').response.status, 400);
  assert.equal(send('/search?q=moon').response.data.films.length, 2);
  const first = send('/catalog?page=1&limit=3');
  assert.equal(first.response.data.next, '/catalog?page=2&limit=3');
  assert.equal(send(first.response.data.next).response.data.films[0].id, 4);
  assert.equal(send('/catalog?limit=99').response.status, 422);
});

test('ETag returns 304 without a body only for an exact match', () => {
  const { send } = harness();
  const tag = send('/poster').response.headers.ETag;
  assert.equal(send('/poster', 'GET', undefined, { 'If-None-Match': tag }).response.status, 304);
  assert.equal(send('/poster', 'GET', undefined, { 'If-None-Match': tag }).response.text, '');
  assert.equal(send('/poster', 'GET', undefined, { 'If-None-Match': 'wrong' }).response.status, 200);
});

test('rate limit allows three calls, rejects early retries, and recovers', () => {
  const h = harness();
  assert.deepEqual([h.send('/limited'), h.send('/limited'), h.send('/limited')].map(a => a.response.status), [200, 200, 200]);
  const blocked = h.send('/limited');
  assert.equal(blocked.response.status, 429);
  assert.ok(Number(blocked.response.headers['Retry-After']) > 0);
  assert.equal(h.send('/limited').response.status, 429);
  h.wait(4000);
  assert.equal(h.send('/limited').response.status, 200);
});

test('flaky endpoint fails exactly twice before recovery', () => {
  const { send } = harness();
  assert.deepEqual([send('/flaky'), send('/flaky'), send('/flaky'), send('/flaky')].map(a => a.response.status), [503, 503, 200, 200]);
});

test('refresh must exchange the demo token before the new access token works', () => {
  const { send } = harness();
  assert.equal(send('/session', 'GET', undefined, { Authorization: 'Bearer cinema-fresh' }).response.status, 401);
  assert.equal(send('/refresh', 'POST', { refresh_token: 'wrong' }).response.status, 401);
  const token = send('/refresh', 'POST', { refresh_token: 'refresh-demo' }).response.data.access_token;
  assert.equal(send('/session', 'GET', undefined, { Authorization: 'Bearer ' + token }).response.status, 200);
});

test('redirect locations preserve the service worker base path', () => {
  for (const [path, status] of [['legacy', 301], ['temporary', 302]]) {
    const result = handle(createSession(), { url: `https://example.com/api-cinema/__demo/${path}` });
    assert.equal(result.status, status);
    assert.equal(result.headers.Location, 'https://example.com/api-cinema/__demo/users/1');
  }
});

function solution(id) {
  const h = harness(), a = [];
  const send = (...args) => { const attempt = h.send(...args); a.push(attempt); return attempt; };
  switch (id) {
    case 'address': send('/users/1'); break;
    case 'auth': send('/private', 'GET', undefined, { Authorization: 'Bearer cinema-demo' }); break;
    case 'json': send('/projects', 'POST', { name: 'Short film' }); break;
    case 'query': send('/search?q=moon'); break;
    case 'content': send('/screening', 'POST', { film: 'Arrival' }); break;
    case 'fields': send('/tickets', 'POST', { email: 'alex@example.com', seats: 2 }); break;
    case 'remember': case 'delete': {
      const projectId = send('/projects', 'POST', { name: 'Film' }).response.data.id;
      if (projectId === undefined) throw Error('Missing ID');
      if (id === 'delete') send('/projects/' + projectId, 'DELETE');
      send('/projects/' + projectId); break;
    }
    case 'redirect301': case 'redirect302': {
      const last = send(id === 'redirect301' ? '/legacy' : '/temporary');
      last.response = { ...h.send('/users/1').response, redirected: true, finalURL: 'https://demo.invalid/users/1' }; break;
    }
    case 'etag': { const tag = send('/poster').response.headers.ETag; send('/poster', 'GET', undefined, { 'If-None-Match': tag }); break; }
    case 'pagination': send('/catalog?page=1&limit=3'); send('/catalog?page=2&limit=3'); break;
    case 'retry': for (let i = 0; i < 4; i++) send('/limited'); h.wait(4000); send('/limited'); break;
    case 'flaky': send('/flaky'); h.wait(1000); send('/flaky'); h.wait(1000); send('/flaky'); break;
    case 'refresh': send('/session'); { const token = send('/refresh', 'POST', { refresh_token: 'refresh-demo' }).response.data.access_token; send('/session', 'GET', undefined, { Authorization: 'Bearer ' + token }); } break;
  }
  return a;
}

for (const challenge of challenges) {
  test(`${challenge.id}: actual solution passes; empty and unrelated success fail`, () => {
    assert.equal(assess(challenge.id, solution(challenge.id)).solved, true);
    assert.equal(assess(challenge.id, []).solved, false);
    assert.equal(assess(challenge.id, [harness().send('/users/999')]).solved, false);
    const unrelated = harness().send('/unrelated'); unrelated.response.status = 200;
    assert.equal(assess(challenge.id, [unrelated]).solved, false);
    const broken = solution(challenge.id); broken.at(-1).request.broken = true;
    assert.equal(assess(challenge.id, broken).solved, false);
  });
}

test('multi-request validators reject missing history and wrong resource IDs', () => {
  for (const id of ['remember', 'delete', 'etag', 'pagination', 'retry', 'flaky', 'refresh']) {
    const attempts = solution(id);
    assert.equal(assess(id, [attempts.at(-1)]).solved, false, id);
    assert.equal(assess(id, attempts.toReversed()).solved, false, id);
  }
  const attempts = solution('remember');
  attempts.at(-1).request.url = 'demo://api/projects/105';
  assert.equal(assess('remember', attempts).solved, false);
  const pagination = solution('pagination');
  pagination.at(-1).request.url = 'demo://api/catalog?limit=3&page=2';
  assert.equal(assess('pagination', pagination).solved, true);
});

test('retry validators reject requests sent before Retry-After', () => {
  for (const id of ['retry', 'flaky']) {
    const attempts = solution(id);
    attempts.at(-1).request.startedAt = attempts.at(-2).response.receivedAt;
    assert.equal(assess(id, attempts).solved, false);
  }
});

test('validators reject a wrong token, wrong body, missing match, and malformed inputs', () => {
  const auth = solution('auth'); auth[0].request.headers.Authorization = 'Bearer wrong';
  assert.equal(assess('auth', auth).solved, false);
  const fields = solution('fields'); fields[0].request.body = '{"email":"wrong","seats":2}';
  assert.equal(assess('fields', fields).solved, false);
  const cache = solution('etag'); cache.at(-1).request.headers['If-None-Match'] = 'wrong';
  assert.equal(assess('etag', cache).solved, false);
  for (const challenge of challenges) {
    assert.equal(assess(challenge.id, [null, {}, { request: null }]).solved, false);
  }
});

test('all challenge hints progress from nudge to answer', () => {
  assert.equal(challenges.length, 15);
  for (const challenge of challenges) {
    assert.equal(challenge.hints.length, 3);
    assert.ok(challenge.hints[0] !== challenge.hints[2]);
    assert.ok(challenge.note.length > 30);
  }
});

test('demo URL conversion keeps query parameters and rejects a wrong host', () => {
  assert.equal(tools.resolveDemo('demo://api/catalog?page=2&limit=3', 'https://example.com/api-cinema/'), 'https://example.com/api-cinema/__demo/catalog?page=2&limit=3');
  assert.throws(() => tools.resolveDemo('demo://wrong/catalog', 'https://example.com/'));
  assert.throws(() => tools.resolveDemo('file:///etc/passwd', 'https://example.com/'));
});

test('cURL export/import round trips quoted bodies and shell metacharacters as text', () => {
  const request = { url: 'https://example.com/api?q=one&x=two', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: "Sam's film", literal: '$(never-run)' }), redirect: 'follow' };
  const parsed = tools.importCurl(tools.asCurl(request));
  assert.equal(parsed.url, request.url);
  assert.equal(parsed.body, request.body);
  assert.equal(parsed.method, 'POST');
  assert.equal(parsed.redirect, 'follow');
  assert.equal(new Headers(parsed.headers).get('content-type'), 'application/json');
});

test('cURL importer rejects unsupported or incomplete options and never reads files', () => {
  for (const command of ['curl -H', 'curl --upload-file secret.txt https://example.com', 'curl -d @secret.json https://example.com', "curl 'https://example.com", 'curl https://a.com https://b.com', 'wget https://a.com']) assert.throws(() => tools.importCurl(command));
  assert.equal(tools.importCurl('curl https://example.com --json \'{"name":"film"}\'').method, 'POST');
});

test('demo cURL is rejected instead of pretending the browser endpoint is a server', () => {
  assert.throws(() => tools.asCurl({ url: 'demo://api/users/1', method: 'GET' }), /service worker/);
  const code = tools.asFetch({ url: 'demo://api/search?q=moon', method: 'GET', headers: {}, redirect: 'follow' }, 'https://example.com/api-cinema/');
  assert.match(code, /api-cinema\/__demo\/search\?q=moon/);
});
