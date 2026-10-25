(function (root, factory) {
  const tools = factory();
  if (typeof module !== 'undefined') module.exports = tools;
  else root.RequestTools = tools;
})(globalThis, function () {
  function resolveDemo(input, base) {
    const parsed = new URL(input);
    if (parsed.protocol !== 'demo:') {
      if (!['http:', 'https:'].includes(parsed.protocol)) throw Error('Use demo:// or an HTTP(S) URL.');
      return parsed.href;
    }
    if (parsed.hostname !== 'api') throw Error('Demo addresses start with demo://api/.');
    const target = new URL('./__demo/' + parsed.pathname.slice(1), base);
    target.search = parsed.search;
    return target.href;
  }
  function quote(value) { return "'" + String(value).replaceAll("'", "'\\''") + "'"; }
  function asCurl(request) {
    if (request.url.startsWith('demo:')) throw Error('cURL cannot reach a service worker. Choose an external API to copy a runnable cURL command.');
    const parts = ['curl'];
    if (request.redirect === 'follow') parts.push('-L');
    parts.push('-X', quote(request.method), quote(request.url));
    new Headers(request.headers).forEach((value, name) => parts.push('-H', quote(`${name}: ${value}`)));
    if (!['GET', 'HEAD'].includes(request.method) && request.body) parts.push('--data-raw', quote(request.body));
    return parts.join(' ');
  }
  function asFetch(request, base) {
    const url = resolveDemo(request.url, base);
    const options = { method: request.method, headers: Object.fromEntries(new Headers(request.headers)), redirect: request.redirect || 'follow', cache: 'no-store' };
    if (!['GET', 'HEAD'].includes(request.method)) options.body = request.body;
    return `${request.url.startsWith('demo:') ? '// Run on this API Cinema page: the demo lives in its service worker.\n' : ''}const response = await fetch(${JSON.stringify(url)}, ${JSON.stringify(options, null, 2)});\nconsole.log(response.status, await response.text());`;
  }
  // Tokenize a small cURL subset without running any shell code.
  function tokenize(command) {
    const tokens = []; let token = '', quoteMode = null, started = false;
    for (let i = 0; i < command.length; i++) {
      const char = command[i];
      if (char === '\\' && quoteMode !== "'") { if (++i >= command.length) throw Error('Trailing escape in cURL command.'); if (command[i] !== '\n') token += command[i]; started = true; }
      else if (quoteMode) { if (char === quoteMode) quoteMode = null; else token += char; }
      else if (char === "'" || char === '"') { quoteMode = char; started = true; }
      else if (/\s/.test(char)) { if (started) { tokens.push(token); token = ''; started = false; } }
      else { token += char; started = true; }
    }
    if (quoteMode) throw Error('Close the quotation mark in the cURL command.');
    if (started) tokens.push(token);
    return tokens;
  }
  function importCurl(command) {
    const words = tokenize(command.trim());
    if (words.shift() !== 'curl') throw Error('Start with curl. Only a single HTTP request is supported.');
    const q = { url: '', method: 'GET', headers: {}, body: '', redirect: 'error' }; let explicitMethod = false;
    const argument = i => { if (words[i] === undefined) throw Error('A cURL option is missing its value.'); return words[i]; };
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (word === '-L' || word === '--location') q.redirect = 'follow';
      else if (word === '-X' || word === '--request') { q.method = argument(++i).toUpperCase(); explicitMethod = true; }
      else if (word === '-H' || word === '--header') { const value = argument(++i), split = value.indexOf(':'); if (split < 1) throw Error('Headers need Name: value.'); q.headers[value.slice(0, split).trim()] = value.slice(split + 1).trim(); }
      else if (['-d', '--data', '--data-raw', '--data-binary', '--json'].includes(word)) { q.body = argument(++i); if (q.body.startsWith('@')) throw Error('File uploads are not supported. Paste the body instead.'); if (!explicitMethod) q.method = 'POST'; if (word === '--json') q.headers['Content-Type'] = 'application/json'; }
      else if (word === '--url') { if (q.url) throw Error('Use one URL per import.'); q.url = argument(++i); }
      else if (word.startsWith('-')) throw Error(`Unsupported cURL option: ${word}`);
      else if (!q.url) q.url = word;
      else throw Error('Use one URL per import.');
    }
    if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'].includes(q.method)) throw Error('Unsupported HTTP method.');
    resolveDemo(q.url, 'https://demo.invalid/');
    return q;
  }
  return { resolveDemo, asCurl, asFetch, importCurl };
});
