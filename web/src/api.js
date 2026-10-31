export const LOOPBACK = 'http://127.0.0.1:4173';
const activityListeners = new Set();
let activityClient = null;
let selectedTaskId = null;
export function selectActivityTask(taskId) {
  selectedTaskId = taskId || null;
  publishActivity({ type: 'selection', taskId: selectedTaskId });
}
export function observeLocalActivity(listener) {
  activityListeners.add(listener);
  listener({ type: 'selection', taskId: selectedTaskId });
  if (activityClient?.connected) {
    listener({ type: 'connected' });
    activityClient.startActivity();
  }
  return () => {
    activityListeners.delete(listener);
    if (!activityListeners.size) activityClient?.stopActivity();
  };
}
function publishActivity(event) {
  for (const listener of activityListeners) {
    try { listener(event); } catch { /* A view failure must not interrupt local work. */ }
  }
}
export class LocalAPI {
  constructor({ origin = globalThis.location?.origin, fetcher = globalThis.fetch } = {}) {
    this.sameOrigin = origin === LOOPBACK;
    this.fetcher = fetcher.bind(globalThis);
    this.token = '';
    this.connected = false;
    this.controllers = new Set();
    this.activityTimer = null;
    this.activityGeneration = 0;
    this.activityStarted = false;
  }
  async pair(token) {
    if (!token.trim()) throw new Error('Enter the pairing token shown by your local companion.');
    this.token = token.trim();
    try {
      const health = await this.request('/api/health');
      if (!health.machine || !health.runtimes) throw new Error('The companion returned an unsupported health response.');
      this.connected = true;
      if (activityClient && activityClient !== this) activityClient.stopActivity();
      activityClient = this;
      publishActivity({ type: 'connected' });
      this.startActivity();
      return health;
    } catch (error) { this.disconnect(); throw error; }
  }
  disconnect() {
    this.stopActivity();
    if (activityClient === this) { activityClient = null; selectedTaskId = null; publishActivity({ type: 'disconnected' }); }
    this.token = ''; this.connected = false;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
  stopActivity() {
    clearTimeout(this.activityTimer);
    this.activityTimer = null;
    this.activityStarted = false;
    this.activityGeneration++;
  }
  startActivity() {
    if (!this.connected || !activityListeners.size || this.activityStarted) return;
    this.activityStarted = true;
    const generation = ++this.activityGeneration;
    const poll = async () => {
      let delay = 4000;
      try {
        const state = await this.request('/api/state', { timeout: 10000 });
        if (generation !== this.activityGeneration || !this.connected) return;
        publishActivity({ type: 'state', state });
        if (state.jobs?.some(job => ['queued', 'running'].includes(job.status))) delay = 1000;
      } catch {
        if (generation !== this.activityGeneration || !this.connected) return;
        publishActivity({ type: 'error' });
      }
      if (generation === this.activityGeneration && this.connected && activityListeners.size) this.activityTimer = setTimeout(poll, delay);
    };
    void poll();
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
  upload(file) { const csv=/\.csv$/i.test(file.name); return this.request(csv?'/api/datasets':'/api/files', { method: 'POST', body: file, headers: { 'Content-Type': csv?'text/csv':'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }, timeout: 300000 }); }
}
