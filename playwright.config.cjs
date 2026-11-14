const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './browser-tests',
  use: { baseURL: 'http://127.0.0.1:4173', headless: true },
  webServer: { command: 'node server.cjs', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
