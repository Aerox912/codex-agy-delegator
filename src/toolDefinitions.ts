import type { DispatchContext, DispatchHost } from './routingPolicy.js';
import { allowedDispatchTargets } from './routingPolicy.js';

const commonDelegateProperties = {
  repoPath: { type: 'string', description: 'Absolute path to the target git repository.' },
  task: { type: 'string', description: 'Task instruction for the delegated agent.' },
  allowedFiles: {
    type: 'array',
    items: { type: 'string' },
    description: 'Optional allowed file paths or globs.',
  },
  forbiddenFiles: {
    type: 'array',
    items: { type: 'string' },
    description: 'Optional forbidden file paths or globs.',
  },
  testCommands: {
    type: 'array',
    items: { type: 'string' },
    description: 'Verification commands executed without a shell.',
  },
  timeoutMs: {
    type: 'number',
    description: 'Agent timeout in milliseconds. Defaults to 45 minutes.',
  },
  testTimeoutMs: {
    type: 'number',
    description: 'Timeout per test command in milliseconds. Defaults to 15 minutes.',
  },
  useWorktree: {
    type: 'boolean',
    description: 'Use an isolated git worktree. Defaults to true.',
  },
  branchPrefix: { type: 'string', description: 'Prefix for the temporary branch.' },
  dryRun: {
    type: 'boolean',
    description: 'Validate and show the invocation without creating artifacts.',
  },
  responseMode: {
    type: 'string',
    enum: ['compact', 'standard', 'full'],
    description: 'Response detail. Defaults to compact.',
  },
  maxFiles: { type: 'number', description: 'Maximum files in compact responses.' },
  maxTestTailLines: {
    type: 'number',
    description: 'Maximum test output tail lines retained.',
  },
  includeDiffStat: {
    type: 'boolean',
    description: 'Include a capped diff stat in compact responses.',
  },
  waitForCompletion: {
    type: 'boolean',
    description: 'Wait for completion instead of returning a background run ID.',
  },
  model: { type: 'string', description: 'Optional backend model override.' },
  permissionMode: {
    type: 'string',
    enum: ['read-only', 'workspace-write'],
    description: 'Backend permission mode. Defaults to workspace-write.',
  },
} as const;

export const reportProperties = {
  repoPath: { type: 'string', description: 'Absolute path to the repository.' },
  runId: { type: 'string', description: 'Delegated run ID.' },
  detail: {
    type: 'string',
    enum: ['compact', 'full', 'logs', 'diffStat', 'patch'],
    description: 'Report detail. Defaults to compact.',
  },
  maxBytes: {
    type: 'number',
    description: 'Maximum bytes for logs, diff stat, or patch.',
  },
} as const;

function delegateTool(target: DispatchHost) {
  const label = target === 'agy' ? 'Agy' : target[0].toUpperCase() + target.slice(1);
  const properties = {
    ...commonDelegateProperties,
    model: target === 'claude'
      ? {
        type: 'string',
        description: 'Optional Claude model alias. Defaults to opus[1m]; use sonnet '
          + 'for small tasks. sonnet, opus, fable, and their [1m] or [200k] aliases '
          + 'always resolve to the corresponding [1m] alias; every other value is rejected.',
      }
      : target === 'agy'
        ? {
          type: 'string',
          description: 'Optional Agy model override. Defaults to gemini-3.1-pro-high.',
        }
        : commonDelegateProperties.model,
    ...(target === 'claude'
      ? {
        effort: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'xhigh', 'max'],
          description: 'Optional Claude effort override. Defaults to xhigh for fable and '
            + 'opus, and high for sonnet.',
        },
      }
      : {}),
  };
  return {
    name: `delegate_to_${target}`,
    description: target === 'claude'
      ? 'Delegate a coding task to an isolated Claude leaf worker using a 1M-context model.'
      : `Delegate a coding task to an isolated ${label} leaf worker.`,
    inputSchema: {
      type: 'object',
      properties,
      required: ['repoPath', 'task'],
    },
    annotations: {
      title: `Delegate to ${label}`,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  };
}

export function buildToolDefinitions(context: DispatchContext) {
  if (!context.host || context.workerBoundary || context.depth >= 1) return [];
  const dispatchTools = allowedDispatchTargets(context).map(delegateTool);
  return [
    ...dispatchTools,
    {
      name: 'get_agent_run_report',
      description: 'Read progress, logs, diff summary, or patch for a delegated run.',
      inputSchema: {
        type: 'object',
        properties: reportProperties,
        required: ['repoPath', 'runId'],
      },
      annotations: {
        title: 'Get agent run report',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'apply_agent_run',
      description: 'Apply a reviewed delegated patch to a clean target repository.',
      inputSchema: {
        type: 'object',
        properties: {
          repoPath: { type: 'string', description: 'Absolute path to the repository.' },
          runId: { type: 'string', description: 'Delegated run ID.' },
          confirm: { type: 'boolean', description: 'Must be true to apply the patch.' },
          allowNeedsReview: {
            type: 'boolean',
            description: 'Explicitly allow applying a needs_review run. Blocked runs are never allowed.',
          },
        },
        required: ['repoPath', 'runId', 'confirm'],
      },
      annotations: {
        title: 'Apply agent run',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'cleanup_agent_run',
      description: 'Cancel a delegated run and safely remove its managed artifacts.',
      inputSchema: {
        type: 'object',
        properties: {
          repoPath: { type: 'string', description: 'Absolute path to the repository.' },
          runId: { type: 'string', description: 'Delegated run ID.' },
          removeWorktree: { type: 'boolean', description: 'Also remove the managed git worktree.' },
        },
        required: ['repoPath', 'runId'],
      },
      annotations: {
        title: 'Clean up agent run',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'list_agent_backends',
      description: 'Check which built-in agent CLIs are installed and compatible.',
      inputSchema: {
        type: 'object',
        properties: {
          repoPath: {
            type: 'string',
            description: 'Directory used while probing. Defaults to the server working directory.',
          },
        },
      },
      annotations: {
        title: 'List agent backends',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ];
}
