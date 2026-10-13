import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { beforeEach, afterEach } from 'vitest';

// Infraestructura pública para probar tu propia API por HTTP.
// Cada prueba usa un proceso, puerto y archivo SQLite nuevos.
export function httpLab() {
  let processHandle: ChildProcess | undefined, directory: string, baseUrl: string;
  const target = resolve(process.cwd());
  const start = async () => {
    processHandle = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
      cwd: target, env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'test.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    await new Promise<void>((accept, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`No arrancó ${target}: ${output}`)), 15000);
      processHandle!.once('error', error => { clearTimeout(timer); reject(error); });
      processHandle!.once('exit', code => { clearTimeout(timer); reject(new Error(`Servidor terminó (${code}): ${output}`)); });
      processHandle!.stderr!.on('data', chunk => { output += chunk; });
      processHandle!.stdout!.on('data', chunk => {
        output += chunk;
        const ready = output.match(/APPTIVA_READY=(http:\/\/127\.0\.0\.1:\d+)/);
        if (ready) { baseUrl = ready[1]; clearTimeout(timer); accept(); }
      });
    });
  };
  const stop = async () => {
    if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) {
      const ended = once(processHandle, 'exit');
      processHandle.kill();
      await ended;
    }
  };
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'apptiva-http-')); await start(); });
  afterEach(async () => { await stop(); if (directory) await rm(directory, { recursive: true, force: true }); });
  return {
    restart: async () => { await stop(); await start(); },
    request: async (path: string, method = 'GET', body?: unknown, user: string | null = 'admin') => {
      const response = await fetch(baseUrl + path, {
        method, headers: { ...(user ? { 'x-user': user } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      return { status: response.status, data };
    },
  };
}
