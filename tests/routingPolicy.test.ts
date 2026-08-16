import assert from 'node:assert';
import test from 'node:test';

import {
  allowedDispatchTargets,
  assertDispatchAllowed,
  buildWorkerEnvironment,
  readDispatchContext,
} from '../src/routingPolicy.js';
import { buildToolDefinitions } from '../src/toolDefinitions.js';

const expectedTargets = {
  codex: ['claude', 'agy'],
  claude: ['codex', 'agy'],
  agy: [],
} as const;

for (const [host, targets] of Object.entries(expectedTargets)) {
  test(`${host} receives only its released cross-agent dispatch tools`, () => {
    const context = readDispatchContext({ AGENT_DISPATCH_HOST: host });
    assert.deepStrictEqual(allowedDispatchTargets(context), targets);
    const names = buildToolDefinitions(context).map((tool) => tool.name);
    assert.deepStrictEqual(
      names.filter((name) => name.startsWith('delegate_to_')),
      targets.map((target) => `delegate_to_${target}`),
    );
    assert.ok(!names.includes('delegate_to_agent'));
    assert.ok(!names.includes(`delegate_to_${host}`));
    if (targets.length > 0) {
      const delegate = buildToolDefinitions(context).find(
        (tool) => tool.name === `delegate_to_${targets[0]}`,
      );
      const properties = delegate?.inputSchema.properties as Record<string, any>;
      assert.deepStrictEqual(properties.permissionMode.enum, ['read-only', 'workspace-write']);
      assert.ok(!('allowUnsafe' in properties));
    }
  });
}

test('Claude dispatch tool documents the enforced 1M model policy', () => {
  const context = readDispatchContext({ AGENT_DISPATCH_HOST: 'codex' });
  const delegate = buildToolDefinitions(context).find(
    (tool) => tool.name === 'delegate_to_claude',
  );
  assert.match(delegate?.description ?? '', /1M-context/u);
  const properties = delegate?.inputSchema.properties as Record<string, any>;
  assert.match(properties.model.description, /opus\[1m\]/u);
  assert.match(properties.model.description, /small tasks/u);
  assert.match(properties.model.description, /every other value is rejected/u);
});

test('Agy dispatch tool documents the Gemini 3.1 Pro default', () => {
  const context = readDispatchContext({ AGENT_DISPATCH_HOST: 'codex' });
  const delegate = buildToolDefinitions(context).find(
    (tool) => tool.name === 'delegate_to_agy',
  );
  const properties = delegate?.inputSchema.properties as Record<string, any>;
  assert.match(properties.model.description, /gemini-3\.1-pro-high/u);
});

test('Agy reverse routes require an explicit promotion gate', () => {
  const context = readDispatchContext({
    AGENT_DISPATCH_HOST: 'agy',
    AGENT_DISPATCH_ENABLE_AGY_REVERSE: '1',
  });
  assert.deepStrictEqual(allowedDispatchTargets(context), ['codex', 'claude']);
  assert.deepStrictEqual(
    buildToolDefinitions(context)
      .map((tool) => tool.name)
      .filter((name) => name.startsWith('delegate_to_')),
    ['delegate_to_codex', 'delegate_to_claude'],
  );
});

test('worker boundary hides delegation and rejects direct calls', () => {
  const context = readDispatchContext({
    AGENT_DISPATCH_HOST: 'agy',
    DISPATCH_WORKER_BOUNDARY: '1',
    DISPATCH_DEPTH: '1',
  });
  assert.deepStrictEqual(allowedDispatchTargets(context), []);
  assert.deepStrictEqual(buildToolDefinitions(context), []);
  assert.throws(
    () => assertDispatchAllowed(context, 'codex'),
    /leaf processes/u,
  );
});

test('missing host and same-host dispatch fail closed', () => {
  const missing = readDispatchContext({});
  assert.deepStrictEqual(allowedDispatchTargets(missing), []);
  assert.deepStrictEqual(buildToolDefinitions(missing), []);
  assert.throws(
    () => assertDispatchAllowed(missing, 'claude'),
    /AGENT_DISPATCH_HOST/u,
  );

  const codex = readDispatchContext({ AGENT_DISPATCH_HOST: 'codex' });
  assert.throws(
    () => assertDispatchAllowed(codex, 'codex'),
    /not allowed/u,
  );
});

test('worker environment preserves host and advances the depth boundary', () => {
  const environment = buildWorkerEnvironment({
    AGENT_DISPATCH_HOST: 'claude',
    DISPATCH_DEPTH: '0',
    KEEP_ME: 'yes',
  }, {
    origin: 'claude',
    target: 'agy',
    traceId: 'trace-123',
  });
  assert.strictEqual(environment.AGENT_DISPATCH_HOST, 'claude');
  assert.strictEqual(environment.DISPATCH_WORKER_BOUNDARY, '1');
  assert.strictEqual(environment.DISPATCH_DEPTH, '1');
  assert.strictEqual(environment.DISPATCH_ORIGIN, 'claude');
  assert.strictEqual(environment.DISPATCH_TARGET, 'agy');
  assert.strictEqual(environment.DISPATCH_TRACE_ID, 'trace-123');
  assert.strictEqual(environment.KEEP_ME, 'yes');
});

test('malformed or excessive depth fails closed', () => {
  for (const depth of ['invalid', '2']) {
    const context = readDispatchContext({
      AGENT_DISPATCH_HOST: 'codex',
      DISPATCH_DEPTH: depth,
    });
    assert.deepStrictEqual(allowedDispatchTargets(context), []);
  }
});
