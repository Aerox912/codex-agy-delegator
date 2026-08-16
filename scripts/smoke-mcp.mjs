import assert from 'node:assert/strict';
import process from 'node:process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const matrix = {
  codex: ['claude', 'agy'],
  claude: ['codex', 'agy'],
  agy: [],
};
const commonTools = [
  'get_agent_run_report',
  'apply_agent_run',
  'cleanup_agent_run',
  'list_agent_backends',
];
const exerciseInstalledBackends = process.argv.includes('--installed');

async function connect(environment) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...environment,
    },
    stderr: 'pipe',
  });
  const client = new Client(
    { name: 'codex-agy-delegator-smoke', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}

for (const [host, targets] of Object.entries(matrix)) {
  const client = await connect({
    AGENT_DISPATCH_HOST: host,
    DISPATCH_DEPTH: '0',
    DISPATCH_WORKER_BOUNDARY: '0',
  });
  try {
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      [...targets.map((target) => `delegate_to_${target}`), ...commonTools],
    );

    const unsafe = await client.callTool({
      name: `delegate_to_${targets[0] ?? 'codex'}`,
      arguments: {
        repoPath: process.cwd(),
        task: 'This must be rejected before backend execution.',
        dryRun: true,
        permissionMode: 'full-access',
        allowUnsafe: true,
      },
    });
    assert.equal(unsafe.isError, true);

    if (exerciseInstalledBackends) {
      for (const target of targets) {
        const result = await client.callTool({
          name: `delegate_to_${target}`,
          arguments: {
            repoPath: process.cwd(),
            task: 'Validate the safe leaf-worker invocation without starting it.',
            dryRun: true,
            permissionMode: 'read-only',
          },
        });
        assert.notEqual(result.isError, true, `${host} -> ${target} dry run failed`);
        const payload = JSON.parse(result.content[0].text);
        assert.equal(payload.status, 'success', `${host} -> ${target} backend is unavailable`);
        assert.equal(payload.dispatchOrigin, host);
        assert.equal(payload.dispatchTarget, target);
        assert.match(payload.dispatchTraceId, /^[a-f0-9]{32}$/u);
        if (target === 'claude') {
          assert.match(payload.command, /--model opus\[1m\] --effort xhigh/u);
        }
      }
    }
  } finally {
    await client.close();
  }
}

const promotedAgyClient = await connect({
  AGENT_DISPATCH_HOST: 'agy',
  AGENT_DISPATCH_ENABLE_AGY_REVERSE: '1',
  DISPATCH_DEPTH: '0',
  DISPATCH_WORKER_BOUNDARY: '0',
});
try {
  const promotedTargets = ['codex', 'claude'];
  const listed = await promotedAgyClient.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name),
    [...promotedTargets.map((target) => `delegate_to_${target}`), ...commonTools],
  );
  if (exerciseInstalledBackends) {
    for (const target of promotedTargets) {
      const result = await promotedAgyClient.callTool({
        name: `delegate_to_${target}`,
        arguments: {
          repoPath: process.cwd(),
          task: 'Validate the gated safe leaf-worker invocation without starting it.',
          dryRun: true,
          permissionMode: 'read-only',
        },
      });
      assert.notEqual(result.isError, true, `gated agy -> ${target} dry run failed`);
      const payload = JSON.parse(result.content[0].text);
      assert.equal(payload.status, 'success');
      assert.equal(payload.dispatchOrigin, 'agy');
      assert.equal(payload.dispatchTarget, target);
      if (target === 'claude') {
        assert.match(payload.command, /--model opus\[1m\] --effort xhigh/u);
      }
    }
  }
} finally {
  await promotedAgyClient.close();
}

const boundaryClient = await connect({
  AGENT_DISPATCH_HOST: 'agy',
  DISPATCH_DEPTH: '1',
  DISPATCH_WORKER_BOUNDARY: '1',
  DISPATCH_ORIGIN: 'codex',
  DISPATCH_TARGET: 'agy',
  DISPATCH_TRACE_ID: 'smoke-boundary',
});
try {
  assert.deepEqual((await boundaryClient.listTools()).tools, []);
  const directCall = await boundaryClient.callTool({
    name: 'delegate_to_codex',
    arguments: { repoPath: process.cwd(), task: 'This must remain blocked.' },
  });
  assert.equal(directCall.isError, true);
} finally {
  await boundaryClient.close();
}

console.log(
  `MCP smoke passed for all host routes${exerciseInstalledBackends ? ' and installed backends' : ''}.`,
);
