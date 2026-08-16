import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { listAgentBackends, type AgentKind } from './agentBackends.js';
import { applyAgentRun, type ApplyAgentRunArgs } from './applyAgentRun.js';
import { cleanupAgentRun } from './cleanupAgentRun.js';
import { delegateToAgent, type DelegateAgentArgs } from './delegateToAgent.js';
import { getAgentRunReport } from './getAgentRunReport.js';
import {
  assertDispatchAllowed,
  assertDispatcherActive,
  readDispatchContext,
  type DispatchHost,
} from './routingPolicy.js';
import { executeAgentRun } from './runAgentTask.js';
import { buildToolDefinitions } from './toolDefinitions.js';

const dispatchContext = readDispatchContext();

const server = new Server(
  {
    name: 'codex-agy-delegator',
    version: '0.3.1',
  },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: buildToolDefinitions(dispatchContext),
}));

function requireArguments(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new McpError(ErrorCode.InvalidParams, 'Tool arguments must be an object');
  }
  return value as Record<string, unknown>;
}

function requireString(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new McpError(ErrorCode.InvalidParams, `${name} is required`);
  }
  return value;
}

function textResult(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

async function dispatchTo(
  target: DispatchHost,
  args: Record<string, unknown>,
) {
  assertDispatchAllowed(dispatchContext, target);
  const repoPath = requireString(args, 'repoPath');
  const task = requireString(args, 'task');
  if (
    args.permissionMode === 'full-access'
    || args.allowUnsafe === true
    || args.agentCommand !== undefined
    || args.agentArgs !== undefined
  ) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Public dispatch tools accept only built-in agents in read-only or workspace-write mode.',
    );
  }
  const {
    agent: _agent,
    agentCommand: _agentCommand,
    agentArgs: _agentArgs,
    allowUnsafe: _allowUnsafe,
    dispatchOrigin: _dispatchOrigin,
    dispatchTraceId: _dispatchTraceId,
    ...safeArgs
  } = args;
  return delegateToAgent({
    ...safeArgs,
    repoPath,
    task,
    agent: target as AgentKind,
    agentCommand: undefined,
    agentArgs: [],
    allowUnsafe: false,
    dispatchOrigin: dispatchContext.host ?? 'internal',
  } as DelegateAgentArgs);
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const args = requireArguments(request.params.arguments ?? {});
    assertDispatcherActive(dispatchContext);
    switch (request.params.name) {
      case 'delegate_to_codex':
        return textResult(await dispatchTo('codex', args));
      case 'delegate_to_claude':
        return textResult(await dispatchTo('claude', args));
      case 'delegate_to_agy':
        return textResult(await dispatchTo('agy', args));
      case 'get_agent_run_report':
        return textResult(await getAgentRunReport(
          requireString(args, 'repoPath'),
          requireString(args, 'runId'),
          args,
        ));
      case 'apply_agent_run':
        requireString(args, 'repoPath');
        requireString(args, 'runId');
        return textResult(await applyAgentRun(args as unknown as ApplyAgentRunArgs));
      case 'cleanup_agent_run':
        return textResult(await cleanupAgentRun(
          requireString(args, 'repoPath'),
          requireString(args, 'runId'),
          args.removeWorktree === true,
        ));
      case 'list_agent_backends':
        return textResult(await listAgentBackends(
          typeof args.repoPath === 'string' ? args.repoPath : process.cwd(),
        ));
      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`,
        );
    }
  } catch (error: any) {
    return {
      content: [{
        type: 'text' as const,
        text: `Error: ${error?.message ?? 'Unknown error'}`,
      }],
      isError: true,
    };
  }
});

async function main() {
  if (process.argv[2] === '--run-agent-task' || process.argv[2] === '--run-agy-task') {
    const runDir = process.argv[3];
    if (!runDir) throw new Error('Missing run directory for background agent task.');
    await executeAgentRun(runDir);
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `codex-agy-delegator running for host ${dispatchContext.host ?? 'disabled'} at depth ${dispatchContext.depth}`,
  );
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
