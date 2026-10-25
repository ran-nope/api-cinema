(function (root, factory) {
  const rules = factory();
  if (typeof module !== 'undefined') module.exports = rules;
  else root.ChallengeRules = rules;
})(globalThis, function () {
  const setup = (url, method = 'GET', body = '', headers = {}) => ({ url: 'demo://api' + url, method, body, headers: { 'Content-Type': 'application/json', ...headers }, redirect: 'follow' });
  const challenges = [
    { id: 'address', level: 1, title: 'Find the missing actor', goal: 'Fetch user 1. The current address points to user 999.', setup: setup('/users/999'), hints: ['Look at the address before changing the headers.', 'The last part of the path is the user ID.', 'Use GET demo://api/users/1.'], note: 'You reached the API before, but asked for someone it did not have. Changing the ID was enough.' },
    { id: 'auth', level: 1, title: 'Get past the velvet rope', goal: 'Read the protected profile. The request is missing its access token.', setup: setup('/private'), hints: ['The response tells you what is missing.', 'Authentication belongs in an Authorization header.', 'Add "Authorization": "Bearer cinema-demo" to Headers.'], note: 'The address was fine. The server needed proof that this request was allowed in.' },
    { id: 'json', level: 1, title: 'Name the production', goal: 'Create a project. Its JSON body needs a non-empty name.', setup: setup('/projects', 'POST', '{"description":"No name yet"}'), hints: ['Read the name field error in the response.', 'Put a name string inside the body object.', 'Send POST /projects with {"name":"Short film"}.'], note: 'Valid JSON only means the server can read it. It can still ask for a field you left out.' },
    { id: 'query', level: 2, title: 'Search the film shelf', goal: 'Find the films matching moon. Add a query parameter named q.', setup: setup('/search'), hints: ['The search term belongs after the path.', 'Query parameters start with ? and pair a name with a value.', 'Use demo://api/search?q=moon.'], note: 'The path picked the search operation; q narrowed down what it returned.' },
    { id: 'content', level: 2, title: 'Label the envelope', goal: 'Book this screening. The body is JSON, but the Content-Type says otherwise.', setup: setup('/screening', 'POST', '{"film":"Arrival"}', { 'Content-Type': 'text/plain' }), hints: ['The server returned 415, not a JSON syntax error.', 'Check the header describing the body format.', 'Set Content-Type to application/json, then send again.'], note: 'The bytes were already right. Content-Type told the server how to interpret them.' },
    { id: 'fields', level: 2, title: 'Fix the booking', goal: 'Book two seats with alex@example.com. Read the 422 field errors and repair the body.', setup: setup('/tickets', 'POST', '{"email":"alex","seats":0}'), hints: ['There is more than one invalid field.', 'Use a complete email address and an integer seat count.', 'Send {"email":"alex@example.com","seats":2}.'], note: 'A 422 means the JSON made sense as a format, but the values did not pass the endpoint’s rules.' },
    { id: 'remember', level: 2, title: 'Pick up where you left off', goal: 'Create a project, then fetch that same project by the ID returned in the response.', setup: setup('/projects', 'POST', '{"name":"Second take"}'), hints: ['Keep the ID from the 201 response.', 'A single project lives at /projects/ID. Use GET to read it.', 'After POST succeeds, load the next request or enter GET demo://api/projects/<returned id>.'], note: 'That GET read the object saved by your POST. It was not another copy of the input being echoed back.' },
    { id: 'delete', level: 2, title: 'Leave it on the cutting room floor', goal: 'Create a project, delete it, then fetch its address again. The final response should be 404.', setup: setup('/projects', 'POST', '{"name":"Unused scene"}'), hints: ['This takes three requests in order.', 'Use the same ID for DELETE and the final GET.', 'POST /projects, DELETE /projects/<id>, then GET /projects/<id>.'], note: 'The 204 confirmed the deletion. The later 404 showed that the resource was really gone.' },
    { id: 'redirect301', level: 3, title: 'The permanent move', goal: 'Allow redirects, then request the old /legacy address. Follow its 301 to the user profile.', setup: { ...setup('/legacy'), redirect: 'error' }, hints: ['The address is intentionally old. Keep it.', 'Check Redirect handling in the request editor.', 'Set Redirect handling to Follow redirects and send GET /legacy.'], note: 'The old route returned 301. Fetch followed Location and showed you the final 200. Fetch does not expose every intermediate header.' },
    { id: 'redirect302', level: 3, title: 'A temporary detour', goal: 'Follow the temporary /temporary redirect to the user profile.', setup: { ...setup('/temporary'), redirect: 'error' }, hints: ['The resource is available at a different location for now.', 'A 302 can be followed without changing your original URL.', 'Set Redirect handling to Follow redirects and send GET /temporary.'], note: 'A 302 points somewhere else for this request. It does not say the original address has moved for good.' },
    { id: 'etag', level: 3, title: 'Have we seen this poster?', goal: 'Fetch the poster, copy its ETag into If-None-Match, and request it again. Look for a bodyless 304.', setup: setup('/poster'), hints: ['The first response includes a version identifier in its headers.', 'Send that exact ETag back in If-None-Match, including its quotes.', 'Set "If-None-Match": "\"poster-v1\"" after the first GET.'], note: 'The poster had not changed. A 304 carries no replacement body, so a real client would reuse its cached copy.' },
    { id: 'pagination', level: 3, title: 'Turn the page', goal: 'Fetch the first catalog page, then request the next page using its next address.', setup: setup('/catalog?page=1&limit=3'), hints: ['The response body has a next field.', 'Keep limit=3 when you change the page.', 'After page 1, request demo://api/catalog?page=2&limit=3.'], note: 'You fetched a different slice instead of downloading the whole catalog again. The page size stayed the same.' },
    { id: 'retry', level: 4, title: 'The queue at the door', goal: 'Send requests until you receive 429. Read Retry-After, wait that many seconds, then retry.', setup: setup('/limited'), hints: ['Three requests fit in the four-second window.', '429 is a signal to pause, not to keep pressing Send.', 'After 429, wait the full Retry-After interval shown in Headers, then send GET /limited again.'], note: 'The limit was temporary. Waiting until the server’s retry time let the same request succeed.' },
    { id: 'flaky', level: 4, title: 'Third take works', goal: 'The endpoint returns 503 twice, then recovers. Retry the same GET and respect Retry-After.', setup: setup('/flaky'), hints: ['A 503 can be temporary. This GET is safe to repeat.', 'Look for Retry-After before trying again.', 'Send GET /flaky three times, waiting at least one second after each 503.'], note: 'You repeated a safe read after a short wait. Automatically repeating writes needs more care because it can create duplicates.' },
    { id: 'refresh', level: 4, title: 'Renew the pass', goal: 'Try the expired token, exchange refresh-demo for a new access token, then retry /session with it.', setup: setup('/session', 'GET', '', { Authorization: 'Bearer cinema-expired' }), hints: ['The 401 tells you where to exchange a refresh token.', 'POST /refresh with JSON, then put its access_token in Authorization.', 'Send {"refresh_token":"refresh-demo"} to /refresh. Then GET /session with Authorization: Bearer cinema-fresh.'], note: 'The expired access token never became valid again. You exchanged the refresh token for a new one and retried the original request.' }
  ];

  function header(values, name) { return new Headers(values).get(name); }
  function body(request) { try { return JSON.parse(request.body); } catch { return null; } }
  function path(attempt, route, method = 'GET') {
    try { const url = new URL(attempt.request.url); return url.protocol === 'demo:' && url.hostname === 'api' && url.pathname === route && attempt.request.method === method; } catch { return false; }
  }
  function ok(attempt, route, status = 200, method = 'GET') { return path(attempt, route, method) && attempt.response.status === status; }
  function eligible(attempt) { return attempt?.request && attempt?.response && !attempt.request.broken; }
  function assessSequence(id, attempts) {
    const valid = attempts.filter(eligible), last = valid.at(-1);
    if (!last || !eligible(attempts.at(-1))) return { solved: false, stage: 0 };
    const r = last.response, q = last.request, data = r.data;
    const result = solved => ({ solved: !!solved, stage: solved ? 1 : 0 });
    const after = (predicate) => valid.slice(0, -1).find(predicate);
    if (id === 'address') return result(ok(last, '/users/1') && data?.id === 1);
    if (id === 'auth') return result(ok(last, '/private') && header(q.headers, 'Authorization') === 'Bearer cinema-demo' && data?.access === 'granted');
    if (id === 'json') return result(ok(last, '/projects', 201, 'POST') && typeof body(q)?.name === 'string' && body(q).name.trim() && data?.name === body(q).name.trim() && data?.created === true);
    if (id === 'query') return result(ok(last, '/search') && new URL(q.url).searchParams.get('q')?.toLowerCase() === 'moon' && data?.films?.includes('Moonlight'));
    if (id === 'content') return result(ok(last, '/screening', 201, 'POST') && header(q.headers, 'Content-Type')?.split(';')[0].trim() === 'application/json' && body(q)?.film === 'Arrival' && data?.booked);
    if (id === 'fields') return result(ok(last, '/tickets', 201, 'POST') && body(q)?.email === 'alex@example.com' && body(q)?.seats === 2 && data?.booked);
    if (id === 'remember' || id === 'delete') {
      const created = valid.find(a => ok(a, '/projects', 201, 'POST') && a.response.data?.created && Number.isInteger(a.response.data.id));
      if (!created) return { solved: false, stage: 0 };
      const route = '/projects/' + created.response.data.id;
      if (id === 'remember') return { solved: last !== created && ok(last, route) && data?.name === created.response.data.name, stage: 1, next: setup(route) };
      const removed = valid.find(a => a !== created && ok(a, route, 204, 'DELETE') && valid.indexOf(a) > valid.indexOf(created));
      return { solved: !!removed && valid.indexOf(last) > valid.indexOf(removed) && ok(last, route, 404), stage: removed ? 2 : 1, next: setup(route, removed ? 'GET' : 'DELETE') };
    }
    if (id === 'redirect301' || id === 'redirect302') return result(ok(last, id === 'redirect301' ? '/legacy' : '/temporary') && q.redirect === 'follow' && r.redirected === true && new URL(r.finalURL).pathname.endsWith('/users/1') && data?.id === 1);
    if (id === 'etag') {
      const initial = after(a => ok(a, '/poster') && header(a.response.headers, 'ETag'));
      return { solved: !!initial && ok(last, '/poster', 304) && header(q.headers, 'If-None-Match') === header(initial.response.headers, 'ETag') && !r.text, stage: initial || ok(last, '/poster') ? 1 : 0 };
    }
    if (id === 'pagination') {
      const initial = after(a => ok(a, '/catalog') && a.response.data?.page === 1 && a.response.data?.limit === 3);
      return { solved: !!initial && ok(last, '/catalog') && new URL(q.url).search === '?page=2&limit=3' && data?.page === 2 && data?.films?.[0]?.id === 4, stage: initial || data?.page === 1 ? 1 : 0, next: setup('/catalog?page=2&limit=3') };
    }
    if (id === 'retry') {
      const blocked = valid.slice(0, -1).findLast(a => ok(a, '/limited', 429));
      const seconds = Number(blocked && header(blocked.response.headers, 'Retry-After'));
      return result(blocked && Number.isFinite(seconds) && seconds > 0 && ok(last, '/limited') && data?.admitted && q.startedAt >= blocked.response.receivedAt + seconds * 1000);
    }
    if (id === 'flaky') {
      const trail = valid.filter(a => path(a, '/flaky')).slice(-3);
      return result(trail.length === 3 && trail[0].response.status === 503 && trail[1].response.status === 503 && trail[2].response.status === 200 && data?.recovered && trail.slice(1).every((a, i) => a.request.startedAt >= trail[i].response.receivedAt + Number(header(trail[i].response.headers, 'Retry-After')) * 1000));
    }
    if (id === 'refresh') {
      const expired = valid.find(a => ok(a, '/session', 401));
      const fresh = valid.find(a => ok(a, '/refresh', 200, 'POST') && body(a.request)?.refresh_token === 'refresh-demo' && valid.indexOf(a) > valid.indexOf(expired));
      const next = fresh ? setup('/session', 'GET', '', { Authorization: 'Bearer ' + fresh.response.data.access_token }) : setup('/refresh', 'POST', '{"refresh_token":"refresh-demo"}');
      return { solved: !!expired && !!fresh && valid.indexOf(last) > valid.indexOf(fresh) && ok(last, '/session') && header(q.headers, 'Authorization') === 'Bearer ' + fresh.response.data.access_token && data?.access === 'granted', stage: fresh ? 2 : expired ? 1 : 0, next };
    }
    return result(false);
  }
  function assess(id, attempts) {
    try { return assessSequence(id, Array.isArray(attempts) ? attempts : []); }
    catch { return { solved: false, stage: 0 }; }
  }
  return { challenges, assess };
});
