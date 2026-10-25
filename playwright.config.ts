import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'off' },
  webServer: {
    // Serve o BUILD DE PRODUÇÃO pelo servidor real. A fonte do TSE aponta para um endereço
    // inexistente: sem interceptação, o app precisa mostrar "Dados indisponíveis".
    command: 'node server/proxy.mjs',
    env: { PORT: '4173', TSE_ORIGEM: 'http://127.0.0.1:9' },
    url: 'http://127.0.0.1:4173/api/saude',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true } },
  ],
});
