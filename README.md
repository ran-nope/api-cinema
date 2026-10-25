# API Cinema

[Try it here](https://ran-nope.github.io/api-cinema/)

I built this to get more comfortable reading API requests and failures. I wanted to change a header or an ID and see exactly why the response changed. AI tools helped with the implementation; I am keeping the behavior and its limits documented here.

There is a request editor, a response viewer, and 15 challenges across four levels. They cover basic requests, saved projects, validation errors, redirects, ETags, pagination, retries, and refreshing a demo token. Each challenge has three hints and a short explanation after you solve it.

![A request walkthrough recorded in the app](docs/demo.gif)

## Run it

With Node.js 24 or later:

```sh
node server.cjs
```

Open http://localhost:4173. To run the API and validator checks:

```sh
node --test cinema.test.cjs
```

There are no packages to install. Opening index.html directly will not work because the demo API needs a service worker.

## A few things I had to get right

- Query parameters used to disappear when demo URLs were translated into fetch URLs. They now survive the conversion.
- A successful response from the wrong address must not solve a challenge. The validators check the actual request and, where needed, earlier requests in the same attempt.
- 204 and 304 responses really have no body. Redirect challenges show the final response because fetch follows the intermediate 301 or 302.

The API is local to each browser tab. Projects and counters live in service-worker memory and reset on reload or Reset demo. Browsers can also discard an idle worker earlier. Solved challenge IDs are saved on the device. None of this is a production backend or authentication system.

Copy as fetch works with the local demos on this page. Copy as cURL is for external APIs: a terminal cannot reach a browser service worker. The cURL importer parses a limited set of flags and never executes the command. External APIs still need to allow CORS.

## Still rough

- The retry exercises require you to wait manually. There is no automatic retry client yet.
- The token refresh is a fixed learning exchange, not OAuth.
- The cURL importer does not support file uploads, cookies, or every shell syntax.
- I'd like to try the challenges with people learning HTTP and rewrite the confusing parts.

GitHub Pages publishes dist/ through .github/workflows/static.yml. The test workflow runs the Node checks on pushes and pull requests.

[MIT license](LICENSE).
