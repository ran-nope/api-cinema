const $ = selector => document.querySelector(selector);
const scenes = [
  { id: 'users', title: 'The happy path', sub: '200 · Read a profile', url: 'demo://api/users/1', method: 'GET', desc: 'Fetch a user profile. Expect a 200 OK response.' },
  { id: 'private', title: 'Members only', sub: '401 · A missing pass', url: 'demo://api/private', method: 'GET', desc: 'Read a protected profile. Break it to remove authentication.' },
  { id: 'projects', title: 'The production desk', sub: 'POST, GET, DELETE', url: 'demo://api/projects', method: 'POST', desc: 'Create a project. GET /projects lists saved objects; /projects/ID reads or deletes one.' },
  { id: 'slow', title: 'The slow burn', sub: '200 · A longer wait', url: 'demo://api/slow', method: 'GET', desc: 'A slow read. Break it to make the demo return 504.' },
  { id: 'limited', title: 'The queue at the door', sub: '200 → 429 → 200', url: 'demo://api/limited', method: 'GET', desc: 'Three calls per four-second window. After 429, wait for Retry-After.' },
  { id: 'flaky', title: 'Third take works', sub: '503 → 503 → 200', url: 'demo://api/flaky', method: 'GET', desc: 'The first two calls fail. Wait a second between retries.' },
  { id: 'custom', title: 'Your own story', sub: 'LIVE · Bring an API', url: 'https://jsonplaceholder.typicode.com/users/1', method: 'GET', desc: 'External request. The destination must permit browser access with CORS.' }
];
let scene = scenes[0];
let broken = false;
let current = null;
let history = [];
let tab = 'body';
let busy = false;
let lastRequest = null;

$('#scenes').innerHTML = scenes.map((item, index) => `<button class="scene ${index === 0 ? 'active' : ''}" data-id="${item.id}"><span class="symbol">${String(index + 1).padStart(2, '0')}</span><span><b>${item.title}</b><small>${item.sub}</small></span></button>`).join('');
document.querySelectorAll('.scene').forEach(button => button.onclick = () => selectScene(button.dataset.id));

function selectScene(id) {
  if (busy) return;
  scene = scenes.find(item => item.id === id);
  broken = false;
  $('#break').setAttribute('aria-pressed', 'false');
  $('#url').value = scene.url;
  $('#method').value = scene.method;
  $('#headers').value = JSON.stringify(scene.id === 'private' ? { 'Content-Type': 'application/json', Authorization: 'Bearer cinema-demo' } : { 'Content-Type': 'application/json' }, null, 2);
  $('#body').value = '{"name":"My short film"}';
  $('#redirect').value = 'follow';
  $('#sceneDescription').textContent = scene.desc;
  document.querySelectorAll('.scene').forEach(button => button.classList.toggle('active', button.dataset.id === id));
  $('#modeBadge').textContent = id === 'custom' ? 'LIVE REQUEST' : 'LOCAL DEMO API';
  $('#break').disabled = !['users', 'private', 'projects', 'slow'].includes(id);
}

$('#break').onclick = () => {
  broken = !broken;
  $('#break').setAttribute('aria-pressed', String(broken));
  $('#sceneDescription').textContent = broken ? 'This request will be deliberately changed before sending. Copy tools use those same changes.' : scene.desc;
};

function resetWorker() {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(Error('The demo reset did not finish. Reload and try again.')), 6000);
    channel.port1.onmessage = () => { clearTimeout(timer); resolve(); };
    navigator.serviceWorker.controller.postMessage({ type: 'RESET_DEMO' }, [channel.port2]);
  });
}

async function setupWorker() {
  if (!('serviceWorker' in navigator)) throw Error('Demo requests need HTTPS or localhost and service worker support.');
  const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
  await navigator.serviceWorker.ready;
  // A deployed update must take control before we reset its new session state.
  if (registration.installing || registration.waiting || !navigator.serviceWorker.controller) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('The demo is updating. Reload and try again.')), 8000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
  await resetWorker();
}
const swReady = setupWorker();
swReady.catch(error => { $('#sessionNote').textContent = error.message; });
$('#resetDemo').onclick = async () => {
  if (busy) return;
  $('#resetDemo').disabled = true;
  try {
    await swReady;
    await resetWorker();
    history = [];
    current = null;
    lastRequest = null;
    $('#metrics').textContent = 'DEMO RESET';
    $('#sessionNote').textContent = 'Demo objects and counters cleared. Solved challenge progress is kept.';
    render();
    window.dispatchEvent(new Event('cinema:reset'));
  } catch (error) { $('#sessionNote').textContent = error.message; }
  finally { $('#resetDemo').disabled = false; }
};

function readRequest() {
  const headers = JSON.parse($('#headers').value || '{}');
  if (!headers || Array.isArray(headers) || typeof headers !== 'object') throw Error('Headers must be a JSON object.');
  const request = { url: $('#url').value.trim(), method: $('#method').value, headers: Object.fromEntries(new Headers(headers)), body: $('#body').value, redirect: $('#redirect').value, broken };
  if (broken) {
    const url = new URL(request.url);
    if (url.protocol === 'demo:') {
      url.searchParams.set('broken', '1');
      request.url = url.href;
      if (url.pathname === '/private') delete request.headers.authorization;
      if (url.pathname === '/projects') request.body = '{"name":';
    }
  }
  return request;
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll('.scene,.challenge-card,[data-level],#method,#url,#headers,#body,#redirect,#break,#resetDemo,#nextRequest,#exitChallenge,#importCurl').forEach(element => element.disabled = value);
  $('#send').disabled = value;
  $('#send').innerHTML = value ? 'In flight…' : 'Send request <span>↗</span>';
  if (!value) $('#break').disabled = !['users', 'private', 'projects', 'slow'].includes(scene.id);
}

$('#requestForm').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  setBusy(true);
  let request = null;
  let waiting;
  let timeout;
  const start = performance.now();
  $('#track').className = 'track sending';
  $('#journeyState').textContent = 'REQUEST LEAVING THE BROWSER';
  try {
    request = readRequest();
    const isDemo = request.url.startsWith('demo:');
    const target = RequestTools.resolveDemo(request.url, location.href);
    if (isDemo) await swReady;
    request.startedAt = Date.now();
    lastRequest = request;
    $('#outLabel').textContent = request.method + ' → REQUEST';
    $('#inLabel').textContent = 'AWAITING RESPONSE';
    $('#track .connection:not(.return) .packet').textContent = request.method;
    $('#modeBadge').textContent = isDemo ? 'LOCAL DEMO API' : 'LIVE REQUEST';
    $('#transport').textContent = isDemo ? 'Local service worker · data lasts until reload or Reset demo' : 'External API · browser networking';
    waiting = setTimeout(() => { $('#track').className = 'track waiting'; $('#journeyState').textContent = 'WAITING FOR THE RESPONSE'; }, 240);
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 15000);
    const sent = performance.now();
    const response = await fetch(target, {
      method: request.method, headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: request.redirect, cache: 'no-store', signal: controller.signal
    });
    const firstByte = performance.now();
    const text = await response.text();
    const end = performance.now();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    current = {
      status: response.status, statusText: response.statusText, ok: response.ok || response.status === 304,
      data, text, headers: Object.fromEntries(response.headers),
      ms: Math.round(end - sent), wait: Math.round(firstByte - sent), read: Math.round(end - firstByte),
      size: new TextEncoder().encode(text).length, url: request.url, method: request.method,
      redirected: response.redirected, finalURL: response.url, receivedAt: Date.now()
    };
    clearTimeout(waiting);
    $('#inLabel').textContent = '← ' + response.status + ' ' + response.statusText;
    $('#track .return .packet').textContent = response.status;
    $('#serverCaption').textContent = current.ok ? 'Request accepted' : 'Request rejected';
    $('#track').className = 'track receiving';
    $('#journeyState').textContent = 'RESPONSE ARRIVED · ' + response.status;
    await new Promise(resolve => setTimeout(resolve, 350));
    $('#track').className = 'track' + (current.ok ? '' : ' error');
  } catch (error) {
    clearTimeout(waiting);
    current = {
      status: 0, ok: false, data: { error: error.name === 'AbortError' ? 'request_timeout' : 'request_failed', message: error.name === 'AbortError' ? 'The request exceeded 15 seconds.' : error.message },
      headers: {}, ms: Math.round(performance.now() - start), wait: 0, read: 0, size: 0,
      url: request?.url || $('#url').value, method: request?.method || $('#method').value, receivedAt: Date.now(), text: ''
    };
    current.text = JSON.stringify(current.data, null, 2);
    $('#inLabel').textContent = 'NO HTTP RESPONSE';
    $('#journeyState').textContent = 'REQUEST COULD NOT COMPLETE';
    $('#track').className = 'track error';
  } finally {
    clearTimeout(timeout);
    setBusy(false);
    history.push(current);
    history = history.slice(-10);
    updateMetrics();
    render();
    window.dispatchEvent(new CustomEvent('cinema:response', { detail: { request, response: current } }));
  }
};

function updateMetrics() {
  $('#metrics').replaceChildren();
  for (const [text, className] of [
    [current.status ? `${current.status} ${current.statusText}` : 'NETWORK ERROR', 'status' + (current.ok ? '' : ' error')],
    [`${current.ms} ms`, 'muted'], [`${(current.size / 1024).toFixed(2)} KB`, 'muted']
  ]) {
    const span = document.createElement('span'); span.className = className; span.textContent = text; $('#metrics').append(span);
  }
  $('#responseHint').textContent = current.redirected ? 'Redirect followed. The status and headers shown belong to the final response.' : 'Open “What happened?” for a short explanation.';
}

function jsonNode(value, key) {
  if (value !== null && typeof value === 'object') {
    const details = document.createElement('details'); details.className = 'json'; details.open = true;
    const summary = document.createElement('summary'); summary.textContent = (key !== undefined ? key + ': ' : '') + (Array.isArray(value) ? `Array [${value.length}]` : `Object {${Object.keys(value).length}}`);
    details.append(summary);
    for (const [name, child] of Object.entries(value)) details.append(jsonNode(child, name));
    return details;
  }
  const row = document.createElement('div'); row.className = 'json-value';
  if (key !== undefined) { const label = document.createElement('span'); label.className = 'json-key'; label.textContent = key + ': '; row.append(label); }
  const text = document.createElement('span'); text.className = value === null ? 'json-null' : typeof value === 'number' ? 'json-number' : 'json-string'; text.textContent = JSON.stringify(value); row.append(text);
  return row;
}

function explanation() {
  if (current.redirected) return ['A detour before the response.', 'The demo route returned ' + (new URL(current.url).pathname === '/legacy' ? '301' : '302') + '. Fetch followed its Location to ' + current.finalURL + '. You see the final response, not a raw intermediate redirect.'];
  const notes = {
    0: ['No HTTP response reached this page.', 'Check the URL, browser CORS rules, and Redirect handling. “Reject redirects” intentionally makes a redirected request fail. A network error is not an HTTP 500.'],
    200: ['The request worked.', 'Read the body for the data returned by this endpoint. A later request can return different data if you create or delete a project.'],
    201: ['The object was created.', 'For /projects, its ID now identifies a saved object in this tab’s demo session. Read it with GET /projects/ID.'],
    204: ['Deleted. No response body needed.', 'The operation succeeded without returning data. Fetch the same project again to check that it is gone.'],
    304: ['The version has not changed.', 'Your If-None-Match matched the ETag. There is no replacement body; a real application would keep using its cached version.'],
    400: ['The request could not be read.', 'Check JSON syntax or a required query parameter. The response message gives a more specific reason.'],
    401: ['The request needs a valid pass.', 'Check Authorization. /private accepts Bearer cinema-demo. For /session, exchange refresh-demo at POST /refresh and use the returned access token. These are learning tokens, not a production login system.'],
    404: ['The resource is not there.', 'Check the path and ID. A deleted project also returns 404.'],
    405: ['Right address, wrong operation.', 'This method is not accepted here. Check the Allow header.'],
    415: ['The body format is mislabeled.', 'Send Content-Type: application/json if this endpoint expects JSON.'],
    422: ['Readable JSON, invalid fields.', 'Inspect errors in the body. Correct each field before sending again.'],
    429: ['Wait before asking again.', 'Read Retry-After in Headers. This demo permits three calls in a four-second window, then accepts calls again after that window ends.'],
    503: ['Temporarily unavailable.', 'The flaky demo fails twice before recovering. Wait the Retry-After interval. Retrying GET is safe; blindly repeating writes can create duplicates.'],
    504: ['The upstream wait ran out.', 'This demo deliberately returns a gateway timeout after a delay. It is different from the browser’s own 15-second timeout.']
  };
  return notes[current.status] || ['An HTTP response arrived.', `The endpoint returned ${current.status}. Read its body and headers for details.`];
}

function render() {
  const content = $('#responseContent'); content.replaceChildren();
  if (!current) { content.innerHTML = '<div class="empty"><span class="empty-icon" aria-hidden="true">{ ··· }</span><b>No response yet.</b><p>Pick a scene or a challenge, then send a request.</p></div>'; return; }
  if (tab === 'body') {
    if ([204, 304].includes(current.status)) content.textContent = `${current.status} has no response body.`;
    else content.append(jsonNode(current.data));
  }
  if (tab === 'headers') {
    if (!Object.keys(current.headers).length) content.textContent = 'No response headers available.';
    for (const [name, value] of Object.entries(current.headers)) {
      const row = document.createElement('div'); row.className = 'header-row';
      const label = document.createElement('b'); label.textContent = name;
      const text = document.createElement('span'); text.textContent = value;
      row.append(label, text); content.append(row);
    }
  }
  if (tab === 'timing') {
    for (const [label, ms] of [['Wait for headers', current.wait], ['Read body', current.read], ['Total fetch', current.ms]]) {
      const row = document.createElement('div'); row.className = 'timing-row';
      const name = document.createElement('span'); name.textContent = label;
      const bar = document.createElement('div'); bar.className = 'timing-bar';
      const fill = document.createElement('i'); fill.style.width = Math.max(1, ms / Math.max(current.ms, 1) * 100) + '%'; bar.append(fill);
      const duration = document.createElement('span'); duration.textContent = ms + ' ms';
      row.append(name, bar, duration); content.append(row);
    }
    const note = document.createElement('p'); note.className = 'muted'; note.textContent = 'Measured around fetch and body reading. Redirects and processing are included; DNS/TLS are not separately measured. Animation is excluded.'; content.append(note);
  }
  if (tab === 'learn') {
    const wrap = document.createElement('div'); wrap.className = 'explain';
    const [title, text] = explanation();
    const heading = document.createElement('h3'); heading.textContent = title;
    const paragraph = document.createElement('p'); paragraph.textContent = text;
    wrap.append(heading, paragraph); content.append(wrap);
  }
}

document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => {
  tab = button.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(item => item.setAttribute('aria-selected', String(item === button)));
  render();
});
const modal = $('#modal');
$('.close').onclick = () => modal.close();
modal.onclick = event => { if (event.target === modal) modal.close(); };

function showMessage(title, message) {
  $('#modalContent').replaceChildren();
  const heading = document.createElement('h2'); heading.textContent = title;
  const paragraph = document.createElement('p'); paragraph.textContent = message;
  $('#modalContent').append(heading, paragraph); modal.showModal();
}
async function copyText(button, text) {
  try { await navigator.clipboard.writeText(text); const label = button.textContent; button.textContent = 'Copied ✓'; setTimeout(() => button.textContent = label, 1500); }
  catch { showMessage('Copy this text', text); }
}
$('#copy').onclick = () => { if (current) copyText($('#copy'), current.text); };
$('#copyCurl').onclick = () => { try { copyText($('#copyCurl'), RequestTools.asCurl(readRequest())); } catch (error) { showMessage('About cURL export', error.message); } };
$('#copyFetch').onclick = () => { try { copyText($('#copyFetch'), RequestTools.asFetch(readRequest(), location.href)); } catch (error) { showMessage('Check the request', error.message); } };
$('#importCurl').onclick = () => {
  $('#modalContent').innerHTML = '<h2>Import a cURL request</h2><p>Paste a single command. Supports -X, -H, --data-raw, --json, --url, and -L. Nothing is executed. File uploads and other flags are rejected.</p><label for="curlInput">cURL command</label><textarea id="curlInput" spellcheck="false"></textarea><p id="curlError" role="status"></p><button id="loadCurl" type="button">Load into editor</button>';
  $('#loadCurl').onclick = () => {
    try {
      const request = RequestTools.importCurl($('#curlInput').value);
      selectScene('custom');
      window.dispatchEvent(new Event('cinema:leave-challenge'));
      putRequest(request);
      $('#sceneDescription').textContent = 'Imported request. Check the destination and body before sending.';
      modal.close();
    } catch (error) { $('#curlError').textContent = error.message; }
  };
  modal.showModal();
};
$('#help').onclick = () => showMessage('Try a request. Then change it.', 'The scene library is free play. Practice Room has four levels, with three hints per challenge. Headers, body, and redirect settings are editable. Demo objects and counters live in a service worker per tab and reset on reload or Reset demo. Browser storage keeps solved challenge IDs. A browser may stop an idle worker and clear its memory sooner. External APIs must allow CORS. The storyboard is an illustration, not a packet capture.');
$('#compare').onclick = () => {
  $('#modalContent').innerHTML = '<h2>Two takes. What changed?</h2>';
  if (history.length < 2) { const note = document.createElement('p'); note.textContent = 'Send two requests first.'; $('#modalContent').append(note); }
  else {
    const grid = document.createElement('div'); grid.className = 'comparison';
    for (const [index, response] of history.slice(-2).entries()) {
      const article = document.createElement('article');
      const heading = document.createElement('h3'); heading.textContent = `Take ${history.length - 1 + index}: ${response.status || 'Network error'}`;
      const note = document.createElement('p'); note.textContent = `${response.method} ${response.url} · ${response.ms} ms`;
      const body = document.createElement('pre'); body.textContent = [204, 304].includes(response.status) ? '(no body)' : JSON.stringify(response.data, null, 2);
      article.append(heading, note, body); grid.append(article);
    }
    $('#modalContent').append(grid);
  }
  modal.showModal();
};
render();
