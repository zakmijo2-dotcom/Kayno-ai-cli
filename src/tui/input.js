export function createKeyDecoder() {
  let buf = '';
  let escTimer = null;
  const queue = [];
  let waiter = null;

  function flushToken(tok) {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(tok);
    } else {
      queue.push(tok);
    }
  }

  function processBuf() {
    while (buf.length > 0) {
      if (buf.startsWith('\x1b[200~')) {
        buf = buf.slice(6);
        continue;
      }
      if (buf.startsWith('\x1b[201~')) {
        buf = buf.slice(6);
        continue;
      }
      if (buf[0] === '\x1b') {
        if (buf.length === 1) {
          if (escTimer) return;
          escTimer = setTimeout(() => {
            escTimer = null;
            buf = '';
            flushToken({ type: 'escape' });
          }, 30);
          return;
        }
        clearTimeout(escTimer);
        escTimer = null;
        if (buf[1] === '[') {
          const m = buf.match(/^\x1b\[([0-9;]*)([A-Za-z~u])/);
          if (!m) return;
          const [, params, fin] = m;
          buf = buf.slice(m[0].length);
          flushToken(csiToken(params, fin));
          continue;
        }
        if (buf[1] === 'O' && buf[2]) {
          const map = { H: 'home', F: 'end', A: 'up', B: 'down', C: 'right', D: 'left' };
          const t = map[buf[2]];
          buf = buf.slice(3);
          if (t) flushToken({ type: t });
          continue;
        }
        const altChar = buf[1];
        buf = buf.slice(2);
        if (altChar === '\r') flushToken({ type: 'shift+enter' });
        else if (altChar === '\x1b') flushToken({ type: 'escape' });
        else flushToken({ type: 'char', value: altChar, alt: true });
        continue;
      }
      const ch = buf[0];
      buf = buf.slice(1);
      flushToken(controlToken(ch));
    }
  }

  function csiToken(params, fin) {
    const nums = params.split(';').map((n) => parseInt(n || '0', 10));
    if (fin === 'u') {
      const code = nums[0];
      const mod = nums[1] || 1;
      if (code === 13 && (mod & 1) === 0 && mod !== 1) return { type: 'shift+enter' };
      if (code === 13) return { type: 'enter' };
      if (code === 9) return { type: mod >= 2 ? 'shift+tab' : 'tab' };
      return { type: 'ignore' };
    }
    switch (fin) {
      case 'A': return { type: 'up' };
      case 'B': return { type: 'down' };
      case 'C': return { type: 'right' };
      case 'D': return { type: 'left' };
      case 'H': return { type: 'home' };
      case 'F': return { type: 'end' };
      case '~': {
        const n = nums[0];
        if (n === 1 || n === 7) return { type: 'home' };
        if (n === 4 || n === 8) return { type: 'end' };
        if (n === 3) return { type: 'delete' };
        if (n === 5) return { type: 'pageup' };
        if (n === 6) return { type: 'pagedown' };
        return { type: 'ignore' };
      }
      default:
        return { type: 'ignore' };
    }
  }

  function controlToken(ch) {
    switch (ch) {
      case '\r':
        return { type: 'enter' };
      case '\t':
        return { type: 'tab' };
      case '\x7f':
      case '\x08':
        return { type: 'backspace' };
      case '\x03':
        return { type: 'ctrl+c' };
      case '\x04':
        return { type: 'ctrl+d' };
      case '\x0c':
        return { type: 'ctrl+l' };
      case '\x15':
        return { type: 'ctrl+u' };
      case '\x0b':
        return { type: 'ctrl+k' };
      case '\x0a':
        return { type: 'ctrl+j' };
      case '\x01':
        return { type: 'home' };
      case '\x05':
        return { type: 'end' };
      case '\x17':
        return { type: 'ctrl+w' };
      default:
        break;
    }
    const cp = ch.codePointAt(0);
    if (cp < 32) return { type: 'ignore' };
    return { type: 'char', value: ch };
  }

  return {
    push(chunk) {
      buf += chunk.toString('utf8');
      processBuf();
    },
    flush() {
      if (escTimer) {
        clearTimeout(escTimer);
        escTimer = null;
        if (buf === '\x1b') {
          buf = '';
          flushToken({ type: 'escape' });
        } else {
          processBuf();
        }
      }
    },
    next() {
      if (queue.length) return Promise.resolve(queue.shift());
      return new Promise((res) => {
        waiter = res;
      });
    },
  };
}

export class InputEditor {
  constructor({ historyLimit = 100 } = {}) {
    this.lines = [''];
    this.row = 0;
    this.col = 0;
    this.history = [];
    this.historyLimit = historyLimit;
    this.historyIndex = -1;
    this.draft = null;
  }

  get text() {
    return this.lines.join('\n');
  }

  isEmpty() {
    return this.lines.length === 1 && this.lines[0].length === 0;
  }

  setText(text) {
    this.lines = String(text).split('\n');
    if (this.lines.length === 0) this.lines = [''];
    this.row = this.lines.length - 1;
    this.col = this.lines[this.row].length;
  }

  insert(value) {
    const parts = String(value).split('\n');
    const line = this.lines[this.row];
    if (parts.length === 1) {
      this.lines[this.row] = line.slice(0, this.col) + parts[0] + line.slice(this.col);
      this.col += parts[0].length;
      return;
    }
    const before = line.slice(0, this.col);
    const after = line.slice(this.col);
    this.lines[this.row] = before + parts[0];
    const tail = parts.at(-1) + after;
    const middle = [...parts.slice(1, -1), tail];
    this.lines.splice(this.row + 1, 0, ...middle);
    this.row += middle.length;
    this.col = parts.at(-1).length;
  }

  newline() {
    const line = this.lines[this.row];
    this.lines[this.row] = line.slice(0, this.col);
    this.lines.splice(this.row + 1, 0, line.slice(this.col));
    this.row += 1;
    this.col = 0;
  }

  backspace() {
    if (this.col > 0) {
      const line = this.lines[this.row];
      this.lines[this.row] = line.slice(0, this.col - 1) + line.slice(this.col);
      this.col -= 1;
      return;
    }
    if (this.row > 0) {
      const prev = this.lines[this.row - 1];
      this.col = prev.length;
      this.lines[this.row - 1] = prev + this.lines[this.row];
      this.lines.splice(this.row, 1);
      this.row -= 1;
    }
  }

  delete() {
    const line = this.lines[this.row];
    if (this.col < line.length) {
      this.lines[this.row] = line.slice(0, this.col) + line.slice(this.col + 1);
      return;
    }
    if (this.row < this.lines.length - 1) {
      this.lines[this.row] = line + this.lines[this.row + 1];
      this.lines.splice(this.row + 1, 1);
    }
  }

  moveLeft() {
    if (this.col > 0) {
      this.col -= 1;
      return true;
    }
    if (this.row > 0) {
      this.row -= 1;
      this.col = this.lines[this.row].length;
      return true;
    }
    return false;
  }

  moveRight() {
    const line = this.lines[this.row];
    if (this.col < line.length) {
      this.col += 1;
      return true;
    }
    if (this.row < this.lines.length - 1) {
      this.row += 1;
      this.col = 0;
      return true;
    }
    return false;
  }

  moveUp() {
    if (this.row === 0) return false;
    this.row -= 1;
    this.col = Math.min(this.col, this.lines[this.row].length);
    return true;
  }

  moveDown() {
    if (this.row >= this.lines.length - 1) return false;
    this.row += 1;
    this.col = Math.min(this.col, this.lines[this.row].length);
    return true;
  }

  home() {
    this.col = 0;
  }

  end() {
    this.col = this.lines[this.row].length;
  }

  killToEnd() {
    const line = this.lines[this.row];
    this.lines[this.row] = line.slice(0, this.col);
  }

  killToStart() {
    const line = this.lines[this.row];
    this.lines[this.row] = line.slice(this.col);
    this.col = 0;
  }

  killPrevWord() {
    const line = this.lines[this.row];
    const left = line.slice(0, this.col);
    const trimmed = left.replace(/\S+\s*$/, '');
    this.lines[this.row] = trimmed + line.slice(this.col);
    this.col = trimmed.length;
  }

  historyPrev() {
    if (this.history.length === 0) return false;
    if (this.historyIndex === -1) {
      this.draft = this.text;
      this.historyIndex = this.history.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex -= 1;
    } else {
      return false;
    }
    this.setText(this.history[this.historyIndex]);
    return true;
  }

  historyNext() {
    if (this.historyIndex === -1) return false;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex += 1;
      this.setText(this.history[this.historyIndex]);
      return true;
    }
    this.historyIndex = -1;
    this.setText(this.draft ?? '');
    this.draft = null;
    return true;
  }

  submit() {
    const text = this.text.replace(/\s+$/, '');
    this.history.push(text);
    if (this.history.length > this.historyLimit) this.history.shift();
    this.historyIndex = -1;
    this.draft = null;
    this.setText('');
    return text;
  }
}

export function applyKeyToEditor(editor, token, { multiline = true } = {}) {
  switch (token.type) {
    case 'char':
      editor.insert(token.value);
      return { action: 'changed' };
    case 'enter':
      if (multiline && editor.lines.length > 1) {
        editor.newline();
        return { action: 'changed' };
      }
      return { action: 'submit' };
    case 'shift+enter':
    case 'ctrl+j':
      if (!multiline) return { action: 'submit' };
      editor.newline();
      return { action: 'changed' };
    case 'backspace':
      editor.backspace();
      return { action: 'changed' };
    case 'delete':
      editor.delete();
      return { action: 'changed' };
    case 'left':
      editor.moveLeft();
      return { action: 'moved' };
    case 'right':
      editor.moveRight();
      return { action: 'moved' };
    case 'up':
      if (editor.moveUp()) return { action: 'moved' };
      if (editor.historyPrev()) return { action: 'changed' };
      return { action: 'none' };
    case 'down':
      if (editor.moveDown()) return { action: 'moved' };
      if (editor.historyNext()) return { action: 'changed' };
      return { action: 'none' };
    case 'home':
      editor.home();
      return { action: 'moved' };
    case 'end':
      editor.end();
      return { action: 'moved' };
    case 'ctrl+k':
      editor.killToEnd();
      return { action: 'changed' };
    case 'ctrl+u':
      editor.killToStart();
      return { action: 'changed' };
    case 'ctrl+w':
      editor.killPrevWord();
      return { action: 'changed' };
    case 'ctrl+l':
      return { action: 'repaint' };
    default:
      return { action: 'none' };
  }
}
