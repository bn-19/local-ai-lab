export const LOOPBACK = 'http://127.0.0.1:4173';
export class LocalAPI {
  constructor({ origin = globalThis.location?.origin, fetcher = globalThis.fetch } = {}) {
    this.sameOrigin = origin === LOOPBACK;
    this.fetcher = fetcher;
    this.token = '';
    this.connected = false;
    this.controllers = new Set();
  }
  async pair(token) {
    if (!token.trim()) throw new Error('Enter the pairing token shown by your local companion.');
    this.token = token.trim();
    try {
      const health = await this.request('/api/health');
      if (!health.machine || !health.runtimes) throw new Error('The companion returned an unsupported health response.');
      this.connected = true;
      return health;
    } catch (error) { this.disconnect(); throw error; }
  }
  disconnect() {
    this.token = ''; this.connected = false;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
  async request(path, { method = 'GET', body, headers = {}, timeout = 30000 } = {}) {
    if (!/^\/api\/[a-zA-Z0-9_/?=&.%:-]+$/.test(path)) throw new Error('Unsupported local API path.');
    if (!this.token) throw new Error('Connect your local companion first.');
    const controller = new AbortController(); this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await this.fetcher(`${LOOPBACK}${path}`, {
        method, body, headers: { ...headers, ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
        ...(!this.sameOrigin ? { targetAddressSpace: 'loopback' } : {})
      });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Local companion API is unavailable. Start it and try connecting again.');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Local request failed (${response.status}).`);
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The local request stopped or timed out. Check the companion before retrying.');
      if (error instanceof TypeError) throw new Error('Cannot reach the local companion. Check that it is running, this site is allowed, and browser local-network permission is granted.');
      throw error;
    } finally { clearTimeout(timer); this.controllers.delete(controller); }
  }
  get(path) { return this.request(path); }
  post(path, data = {}) { return this.request(path, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }); }
  upload(file) { return this.request('/api/datasets', { method: 'POST', body: file, headers: { 'Content-Type': 'text/csv', 'X-Filename': encodeURIComponent(file.name) }, timeout: 300000 }); }
}
