// App state from /api/state, shared by every view. Views subscribe to changes.

import { api } from './api.js';

const listeners = new Set();

export const store = {
  state: { loaded: false, user: null, gw: null, mine: null, judged: 0, minJudged: 5 },
  set(patch) {
    this.state = { ...this.state, ...patch };
    for (const fn of listeners) fn(this.state);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export async function refreshState() {
  const s = await api('/api/state');
  store.set({ ...s, loaded: true });
  return s;
}
