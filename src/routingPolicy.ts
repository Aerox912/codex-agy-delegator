import type { AgentKind } from './agentBackends.js';

export type DispatchHost = Exclude<AgentKind, 'custom'>;

export interface DispatchContext {
  host: DispatchHost | null;
  depth: number;
  workerBoundary: boolean;
  agyReverseEnabled: boolean;
}

export interface WorkerDispatchMetadata {
  origin: DispatchHost | 'internal';
  target: AgentKind;
  traceId: string;
}

const HOSTS: DispatchHost[] = ['codex', 'claude', 'agy'];

const TARGETS_BY_HOST: Record<DispatchHost, DispatchHost[]> = {
  codex: ['claude', 'agy'],
  claude: ['codex', 'agy'],
  agy: ['codex', 'claude'],
};

function parseDepth(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 1;
}

export function readDispatchContext(
  environment: NodeJS.ProcessEnv = process.env,
): DispatchContext {
  const candidate = environment.AGENT_DISPATCH_HOST?.trim().toLowerCase();
  const host = HOSTS.includes(candidate as DispatchHost)
    ? candidate as DispatchHost
    : null;
  const depth = parseDepth(environment.DISPATCH_DEPTH);
  return {
    host,
    depth,
    workerBoundary: environment.DISPATCH_WORKER_BOUNDARY === '1' || depth >= 1,
    agyReverseEnabled: environment.AGENT_DISPATCH_ENABLE_AGY_REVERSE === '1',
  };
}

export function allowedDispatchTargets(context: DispatchContext): DispatchHost[] {
  if (!context.host || context.workerBoundary || context.depth >= 1) return [];
  if (context.host === 'agy' && !context.agyReverseEnabled) return [];
  return [...TARGETS_BY_HOST[context.host]];
}

export function assertDispatcherActive(
  context: DispatchContext,
): asserts context is DispatchContext & { host: DispatchHost; workerBoundary: false } {
  if (!context.host) {
    throw new Error(
      'AGENT_DISPATCH_HOST must be one of codex, claude, or agy before the dispatcher is enabled.',
    );
  }
  if (context.workerBoundary || context.depth >= 1) {
    throw new Error('Delegated workers are leaf processes and cannot use the dispatcher.');
  }
}

export function assertDispatchAllowed(
  context: DispatchContext,
  target: DispatchHost,
): void {
  assertDispatcherActive(context);
  if (!allowedDispatchTargets(context).includes(target)) {
    throw new Error(`${context.host} is not allowed to dispatch to ${target}.`);
  }
}

export function buildWorkerEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  metadata: WorkerDispatchMetadata = {
    origin: 'internal',
    target: 'custom',
    traceId: 'untracked',
  },
): NodeJS.ProcessEnv {
  const currentDepth = parseDepth(environment.DISPATCH_DEPTH);
  return {
    ...environment,
    DISPATCH_WORKER_BOUNDARY: '1',
    DISPATCH_DEPTH: String(Math.max(1, currentDepth + 1)),
    DISPATCH_ORIGIN: metadata.origin,
    DISPATCH_TARGET: metadata.target,
    DISPATCH_TRACE_ID: metadata.traceId,
  };
}
