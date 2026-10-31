import { observeLocalActivity } from './api.js';
import { activityView } from './activity-state.js';
import { element as el } from './dashboard.js';
const panel = document.getElementById('live-activity');
let signature = '';
let announcement;
let content;
function reset() {
  signature = '';
  panel.replaceChildren();
  panel.hidden = true;
  announcement = null;
  content = null;
}
observeLocalActivity(event => {
  if (event.type === 'disconnected') { reset(); return; }
  if (!announcement) {
    announcement = el('span', { class: 'live-status', role: 'status', 'aria-live': 'polite' });
    content = el('div');
    panel.replaceChildren(el('div', { class: 'live-heading' }, el('h2', { id: 'live-activity-title' }, 'Task activity'), announcement), content);
    panel.hidden = false;
  }
  if (event.type === 'connected') { announcement.textContent = 'Connecting to activity'; return; }
  if (event.type === 'error') {
    announcement.dataset.state = 'error';
    announcement.textContent = 'Updates unavailable · retrying';
    return;
  }
  const view = activityView(event.state);
  const next = JSON.stringify(view);
  if (next === signature && announcement.dataset.state !== 'error') return;
  signature = next;
  announcement.dataset.state = view.error ? 'error' : 'ready';
  announcement.textContent = view.error ? `${view.status}: ${view.error}` : view.status;
  const wasOpen = content.querySelector('details')?.open;
  content.replaceChildren();
  if (view.rows.length) content.append(el('ol', { class: 'agent-events' }, view.rows.map(row => el('li', {}, el('strong', {}, row.agent), el('span', {}, row.status)))));
  if (view.evidence.length) content.append(el('details', { open: wasOpen }, el('summary', {}, 'Handoff details'), el('dl', {}, view.evidence.flatMap(([label, value]) => [el('dt', {}, label), el('dd', {}, value)]))));
});
window.addEventListener('pagehide', reset);
