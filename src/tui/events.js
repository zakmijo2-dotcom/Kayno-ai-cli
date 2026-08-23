import { EventEmitter } from 'node:events';

export const EVENTS = [
  'turn_start',
  'text_delta',
  'thinking_start',
  'thinking_delta',
  'thinking_end',
  'tool_start',
  'tool_delta',
  'tool_complete',
  'tool_error',
  'checkpoint',
  'confirmation_required',
  'confirmation_resolved',
  'usage',
  'turn_complete',
  'error',
  'status',
];

export class EventBus extends EventEmitter {
  emitEvent(type, payload = {}) {
    if (!EVENTS.includes(type)) throw new Error(`unknown event type: ${type}`);
    this.emit(type, { type, ...payload, ts: Date.now() });
  }
}

export function createPlainEmitter({ stream = process.stdout } = {}) {
  let activeTool = null;
  return function plainEmit(evt) {
    switch (evt.type) {
      case 'text_delta':
        stream.write(evt.text);
        break;
      case 'tool_start':
        activeTool = evt.name;
        stream.write(`\n[tool:${evt.name}] `);
        break;
      case 'tool_complete':
        stream.write(
          `${String(evt.summary ?? '').slice(0, 400)}${(evt.summaryLen ?? 0) > 400 ? '…' : ''}\n`
        );
        break;
      case 'tool_error':
        stream.write(`error: ${evt.message}\n`);
        break;
      case 'turn_complete':
        if (!evt.aborted) stream.write('\n');
        break;
      default:
        break;
    }
  };
}
