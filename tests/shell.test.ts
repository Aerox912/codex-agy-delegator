import assert from 'node:assert';
import * as os from 'node:os';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { killProcessTree, tailString, waitForProcess } from '../src/shell.js';

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error?.code !== 'ESRCH';
  }
}

test('timeout terminates the complete spawned process tree', async () => {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let output = '';
  stdout.on('data', (chunk) => { output += chunk.toString(); });
  let descendantPid = 0;

  try {
    const script = [
      "const { spawn } = require('node:child_process');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      'console.log(child.pid);',
      'setInterval(() => {}, 1000);',
    ].join(' ');
    const result = await waitForProcess(
      process.execPath,
      ['-e', script],
      os.tmpdir(),
      null,
      stdout,
      stderr,
      700,
    );
    descendantPid = Number.parseInt(output.trim(), 10);
    assert.equal(result.timedOut, true);
    assert.ok(Number.isInteger(descendantPid) && descendantPid > 0);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(isProcessAlive(descendantPid), false);
  } finally {
    if (descendantPid > 0 && isProcessAlive(descendantPid)) {
      await killProcessTree(descendantPid);
    }
  }
});

test('tailString should return full string if within maxLines', () => {
  const input = 'line 1\nline 2\nline 3';
  const result = tailString(input, 5);
  assert.strictEqual(result, input);
});

test('tailString should truncate string if exceeding maxLines', () => {
  const input = '1\n2\n3\n4\n5\n6';
  const result = tailString(input, 3);
  assert.strictEqual(result, '... (3 lines omitted) ...\n4\n5\n6');
});
