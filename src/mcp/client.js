import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const PROTOCOL_VERSION = '2024-11-05';
const CONNECT_TIMEOUT = 5000;
const CALL_TIMEOUT_DEFAULT = 60000;

export function mcpConfigPaths() {
  return [
    process.env.KAYNO_HOME ? join(process.env.KAYNO_HOME, 'mcp.json') : null,
    process.env.NOVA_HOME ? join(process.env.NOVA_HOME, 'mcp.json') : null,
    join(homedir(), '.config', 'mij', 'mcp.json'),
  ].filter(Boolean);
}

export function loadMcpConfig() {
  for (const path of mcpConfigPaths()) {
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      if (raw && typeof raw === 'object' && raw.servers && typeof raw.servers === 'object') {
        return { path, servers: raw.servers };
      }
      return { path, servers: {} };
    } catch {
      return { path, servers: {}, error: `invalid JSON in ${path}` };
    }
  }
  return { path: null, servers: {} };
}

class McpServerConnection {
  constructor(name, cfg) {
    this.name = name;
    this.cfg = cfg;
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.tools = [];
    this.connected = false;
    this.buffer = '';
    this.lastError = null;
  }

  start() {
    const { command, args = [] } = this.cfg;
    if (!command) throw new Error(`mcp server "${this.name}": missing command`);
    this.child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.#onData(chunk));
    this.child.stderr.on('data', (d) => {
      this.lastError = String(d).slice(0, 300);
    });
    this.child.on('error', (err) => {
      this.lastError = err.message;
      for (const [, p] of this.pending) p.reject(err);
      this.pending.clear();
    });
    this.child.on('exit', () => {
      this.connected = false;
      for (const [, p] of this.pending) p.reject(new Error('server exited'));
      this.pending.clear();
    });
    return this;
  }

  #onData(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message ?? 'MCP error'} (${msg.error.code ?? '?'})`));
        else resolve(msg.result);
      }
    }
  }

  request(method, params, timeoutMs = CONNECT_TIMEOUT) {
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.child.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async connect() {
    this.start();
    const result = await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'kayno-mij', version: '0.1.0' },
    }).catch((e) => {
      throw e;
    });
    this.notify('notifications/initialized');
    this.connected = true;
    this.serverInfo = result?.serverInfo ?? {};
    await this.refreshTools();
    return this;
  }

  async refreshTools() {
    const res = await this.request('tools/list', {}, CONNECT_TIMEOUT);
    this.tools = (res?.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
    }));
    return this.tools;
  }

  async callTool(toolName, args, timeoutMs = CALL_TIMEOUT_DEFAULT) {
    const res = await this.request('tools/call', { name: toolName, arguments: args }, timeoutMs);
    if (res?.isError) {
      const text = (res.content ?? [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      throw new Error(text || 'MCP tool error');
    }
    return (res?.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
  }

  stop() {
    try {
      this.child?.kill();
    } catch {}
    this.connected = false;
  }
}

const connections = new Map();

export async function connectServers(configOverride = null) {
  disconnectAll();
  const config = configOverride ?? loadMcpConfig();
  const results = [];
  for (const [name, cfg] of Object.entries(config.servers)) {
    try {
      const conn = new McpServerConnection(name, cfg).start();
      await Promise.race([
        conn.connect(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('connect timeout')), CONNECT_TIMEOUT + 1500)),
      ]);
      connections.set(name, conn);
      results.push({ name, ok: true, tools: conn.tools.length });
    } catch (err) {
      results.push({ name, ok: false, error: err.message });
    }
  }
  return results;
}

export function getConnections() {
  return connections;
}

export function listMcpTools() {
  const out = [];
  for (const [name, conn] of connections) {
    for (const t of conn.tools) {
      out.push({
        type: 'function',
        function: {
          name: `mcp__${name}__${t.name}`,
          description: `[mcp:${name}] ${t.description}`,
          parameters: t.inputSchema,
        },
      });
    }
  }
  return out;
}

export async function callMcpTool(fullName, args) {
  const match = fullName.match(/^mcp__([^_]+(?:__[a-z0-9]+)*?)__(.+)$/s) || fullName.match(/^mcp__(.+?)__(.+)$/s);
  if (!match) throw new Error(`invalid MCP tool name: ${fullName}`);
  const serverName = match[1];
  const toolName = match[2];
  const conn = connections.get(serverName);
  if (!conn) throw new Error(`MCP server "${serverName}" not connected`);
  return conn.callTool(toolName, args);
}

export function disconnectAll() {
  for (const [, conn] of connections) conn.stop();
  connections.clear();
}
