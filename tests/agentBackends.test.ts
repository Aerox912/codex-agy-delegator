import assert from 'node:assert';
import test from 'node:test';

import {
  buildAgentInvocation,
  normalizeAgentOutput,
  resolveAgyModel,
  resolveClaudeModel,
  type AgentBackendConfig,
} from '../src/agentBackends.js';

function config(
  overrides: Partial<AgentBackendConfig> = {},
): AgentBackendConfig {
  return {
    agent: 'codex',
    permissionMode: 'workspace-write',
    allowUnsafe: false,
    timeoutMs: 60_000,
    ...overrides,
  };
}

test('Codex invocation uses an ephemeral workspace-write sandbox and stdin', () => {
  const invocation = buildAgentInvocation(
    config(),
    'do the task',
    '/tmp/repo',
    '/tmp/response.txt',
  );

  assert.strictEqual(invocation.command, 'codex');
  assert.deepStrictEqual(invocation.args, [
    'exec',
    '--ephemeral',
    '--ignore-user-config',
    '--sandbox',
    'workspace-write',
    '--cd',
    '/tmp/repo',
    '--output-last-message',
    '/tmp/response.txt',
    '-',
  ]);
  assert.strictEqual(invocation.stdin, 'do the task');
});

test('Claude invocation maps safe permission modes and normalizes JSON output', () => {
  const invocation = buildAgentInvocation(
    config({ agent: 'claude', permissionMode: 'read-only' }),
    'inspect',
    '/tmp/repo',
    '/tmp/response.txt',
  );

  assert.ok(invocation.args.includes('plan'));
  assert.ok(invocation.args.includes('--strict-mcp-config'));
  assert.ok(invocation.args.includes('{"mcpServers":{}}'));
  assert.ok(invocation.args.includes('--no-session-persistence'));
  assert.strictEqual(
    normalizeAgentOutput('claude', JSON.stringify({ result: 'finished' })),
    'finished',
  );
});

test('resolveClaudeModel defaults to opus[1m] when the model is omitted or blank', () => {
  assert.strictEqual(resolveClaudeModel(undefined), 'opus[1m]');
  assert.strictEqual(resolveClaudeModel(''), 'opus[1m]');
  assert.strictEqual(resolveClaudeModel('   '), 'opus[1m]');
});

test('resolveClaudeModel normalizes the three base aliases to their [1m] form', () => {
  assert.strictEqual(resolveClaudeModel('sonnet'), 'sonnet[1m]');
  assert.strictEqual(resolveClaudeModel('opus'), 'opus[1m]');
  assert.strictEqual(resolveClaudeModel('fable'), 'fable[1m]');
});

test('resolveClaudeModel preserves already-normalized [1m] aliases idempotently', () => {
  assert.strictEqual(resolveClaudeModel('sonnet[1m]'), 'sonnet[1m]');
  assert.strictEqual(resolveClaudeModel('opus[1m]'), 'opus[1m]');
  assert.strictEqual(resolveClaudeModel('fable[1m]'), 'fable[1m]');
});

test('resolveClaudeModel upgrades explicit [200k] variants to [1m]', () => {
  assert.strictEqual(resolveClaudeModel('sonnet[200k]'), 'sonnet[1m]');
  assert.strictEqual(resolveClaudeModel('opus[200k]'), 'opus[1m]');
  assert.strictEqual(resolveClaudeModel('fable[200k]'), 'fable[1m]');
});

test('resolveClaudeModel normalizes case and surrounding whitespace', () => {
  assert.strictEqual(resolveClaudeModel('SONNET'), 'sonnet[1m]');
  assert.strictEqual(resolveClaudeModel('Opus[1M]'), 'opus[1m]');
  assert.strictEqual(resolveClaudeModel('  Fable[200K]  '), 'fable[1m]');
});

test('resolveClaudeModel rejects unknown or unsupported model values', () => {
  assert.throws(() => resolveClaudeModel('haiku'), /Unsupported claude model/u);
  assert.throws(() => resolveClaudeModel('sonnet[2m]'), /Unsupported claude model/u);
  assert.throws(() => resolveClaudeModel('claude-3-5-sonnet'), /Unsupported claude model/u);
  assert.throws(() => resolveClaudeModel('gpt-4'), /Unsupported claude model/u);
});

test('Claude invocation always carries exactly one --model flag with a [1m] alias', () => {
  const withoutModel = buildAgentInvocation(
    config({ agent: 'claude' }),
    'inspect',
    '/tmp/repo',
    '/tmp/response.txt',
  );
  assert.deepStrictEqual(
    withoutModel.args.filter((argument) => argument === '--model'),
    ['--model'],
  );
  const modelIndex = withoutModel.args.indexOf('--model');
  assert.strictEqual(withoutModel.args[modelIndex + 1], 'opus[1m]');

  const withModel = buildAgentInvocation(
    config({ agent: 'claude', model: 'OPUS[200k]' }),
    'inspect',
    '/tmp/repo',
    '/tmp/response.txt',
  );
  const upgradedIndex = withModel.args.indexOf('--model');
  assert.strictEqual(withModel.args[upgradedIndex + 1], 'opus[1m]');

  assert.throws(
    () => buildAgentInvocation(
      config({ agent: 'claude', model: 'haiku' }),
      'inspect',
      '/tmp/repo',
      '/tmp/response.txt',
    ),
    /Unsupported claude model/u,
  );
});

test('resolveAgyModel defaults to Gemini 3.1 Pro High and preserves explicit overrides', () => {
  assert.strictEqual(resolveAgyModel(undefined), 'gemini-3.1-pro-high');
  assert.strictEqual(resolveAgyModel(''), 'gemini-3.1-pro-high');
  assert.strictEqual(resolveAgyModel('   '), 'gemini-3.1-pro-high');
  assert.strictEqual(
    resolveAgyModel('  gemini-3.1-pro-low  '),
    'gemini-3.1-pro-low',
  );
});

test('Agy invocation always carries exactly one --model flag with the configured default', () => {
  const withoutModel = buildAgentInvocation(
    config({ agent: 'agy' }),
    'edit',
    '/tmp/repo',
    '/tmp/response.txt',
  );
  assert.deepStrictEqual(
    withoutModel.args.filter((argument) => argument === '--model'),
    ['--model'],
  );
  const modelIndex = withoutModel.args.indexOf('--model');
  assert.strictEqual(withoutModel.args[modelIndex + 1], 'gemini-3.1-pro-high');

  const withModel = buildAgentInvocation(
    config({ agent: 'agy', model: 'gemini-3.7-flash-low' }),
    'edit',
    '/tmp/repo',
    '/tmp/response.txt',
  );
  const overrideIndex = withModel.args.indexOf('--model');
  assert.strictEqual(withModel.args[overrideIndex + 1], 'gemini-3.7-flash-low');
});

test('non-Claude backends pass the model through unnormalized', () => {
  const codexInvocation = buildAgentInvocation(
    config({ agent: 'codex', model: 'o3' }),
    'edit',
    '/tmp/repo',
    '/tmp/response.txt',
  );
  assert.ok(codexInvocation.args.includes('o3'));

  const agyInvocation = buildAgentInvocation(
    config({ agent: 'agy', model: 'gemini-pro' }),
    'edit',
    '/tmp/repo',
    '/tmp/response.txt',
  );
  assert.ok(agyInvocation.args.includes('gemini-pro'));

  const codexWithoutModel = buildAgentInvocation(
    config({ agent: 'codex' }),
    'edit',
    '/tmp/repo',
    '/tmp/response.txt',
  );
  assert.ok(!codexWithoutModel.args.includes('--model'));
});

test('agy uses its sandbox instead of skipping permissions', () => {
  const invocation = buildAgentInvocation(
    config({ agent: 'agy' }),
    'edit',
    '/tmp/repo',
    '/tmp/response.txt',
  );

  assert.ok(invocation.args.includes('--sandbox'));
  assert.ok(invocation.args.includes('--disable-slash-commands'));
  assert.ok(!invocation.args.includes('--dangerously-skip-permissions'));
});

test('full access and custom commands require an explicit unsafe opt-in', () => {
  assert.throws(
    () => buildAgentInvocation(
      config({ permissionMode: 'full-access' }),
      'edit',
      '/tmp/repo',
      '/tmp/response.txt',
    ),
    /allowUnsafe=true/u,
  );
  assert.throws(
    () => buildAgentInvocation(
      config({ agent: 'custom', agentCommand: 'worker' }),
      'edit',
      '/tmp/repo',
      '/tmp/response.txt',
    ),
    /custom agents require allowUnsafe=true/u,
  );
});

test('custom command placeholders are expanded without a shell', () => {
  const invocation = buildAgentInvocation(
    config({
      agent: 'custom',
      agentCommand: '/usr/bin/worker',
      agentArgs: ['--cwd', '{{cwd}}', '--prompt={{prompt}}'],
      allowUnsafe: true,
    }),
    'safe prompt',
    '/tmp/repo with space',
    '/tmp/response.txt',
  );

  assert.deepStrictEqual(invocation.args, [
    '--cwd',
    '/tmp/repo with space',
    '--prompt=safe prompt',
  ]);
  assert.strictEqual(invocation.stdin, null);
});
