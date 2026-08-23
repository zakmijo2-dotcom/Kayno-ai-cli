import { EventEmitter } from 'node:events';

export function createStore(initial = {}) {
  const bus = new EventEmitter();
  bus.setMaxListeners(50);
  const state = { ...initial };
  return {
    get: () => state,
    set(patch) {
      Object.assign(state, patch);
      bus.emit('change', state, patch);
    },
    on: (...a) => bus.on(...a),
    off: (...a) => bus.off(...a),
  };
}

export function createAppState() {
  const store = createStore({
    width: 80,
    rows: 24,
    providerId: '',
    providerName: '',
    model: '',
    profile: 'coder',
    toolsOn: true,
    yolo: false,
    sessionId: '',
    sessionTitle: '',
    cwdShort: '',
    statusText: '',
    spinnerIndex: 0,
    streaming: false,
    thinking: false,
    input: '',
    overlay: null,
    debugLines: [],
  });
  return store;
}

export class RingBuffer {
  constructor(limit = 50) {
    this.limit = limit;
    this.items = [];
  }
  push(item) {
    this.items.push(item);
    if (this.items.length > this.limit) this.items.splice(0, this.items.length - this.limit);
    return item;
  }
  toArray() {
    return this.items.slice();
  }
}
