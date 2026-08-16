import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

import {
  applyPatch,
  checkPatch,
  getHeadCommit,
  getGitRoot,
  hasUncommittedChanges,
} from './git.js';
import {
  nowIso,
  readRunConfig,
  readRunReport,
  updateRunReport,
} from './runArtifacts.js';
import { findExistingRunDir } from './runPaths.js';

export interface ApplyAgentRunArgs {
  repoPath: string;
  runId: string;
  confirm: boolean;
  allowNeedsReview?: boolean;
}

export async function applyAgentRun(args: ApplyAgentRunArgs) {
  if (args.confirm !== true) {
    throw new Error('Applying a delegated patch requires confirm=true');
  }
  const root = await getGitRoot(args.repoPath);
  if (!root) throw new Error('Not a git repository');
  const runDir = findExistingRunDir(root, args.runId);
  const report = await readRunReport(runDir);
  const config = await readRunConfig(runDir);
  if (!report || !config) throw new Error('Run metadata is incomplete');
  if (report.status === 'blocked') {
    throw new Error('Blocked runs cannot be applied');
  }
  if (
    report.status !== 'success'
    && !(args.allowNeedsReview === true && report.status === 'needs_review')
  ) {
    throw new Error(
      'Only successful runs can be applied; needs_review also requires allowNeedsReview=true',
    );
  }
  if (!config.worktreePath) {
    throw new Error('This run already edited the target repository directly');
  }
  if (report.appliedAt) {
    return { status: 'already_applied', runId: args.runId, appliedAt: report.appliedAt };
  }
  if (await hasUncommittedChanges(root)) {
    throw new Error('Target repository must be clean before applying a delegated patch');
  }
  if (await getHeadCommit(root) !== config.baseCommit) {
    throw new Error('Target repository HEAD changed after delegation; refusing stale patch');
  }

  const patchPath = path.join(runDir, 'diff.patch');
  if (!existsSync(patchPath)) throw new Error('Run patch is missing');
  const patch = await fs.readFile(patchPath);
  const patchSha256 = createHash('sha256').update(patch).digest('hex');
  if (!report.patchSha256 || patchSha256 !== report.patchSha256) {
    throw new Error('Run patch hash does not match the reviewed report');
  }
  if (!patch.toString('utf-8').trim()) {
    const appliedAt = nowIso();
    await updateRunReport(runDir, { appliedAt });
    return {
      status: 'success',
      runId: args.runId,
      appliedAt,
      changedFiles: [],
      noChanges: true,
    };
  }
  await checkPatch(root, patchPath);
  await applyPatch(root, patchPath);
  const appliedAt = nowIso();
  await updateRunReport(runDir, { appliedAt });
  return {
    status: 'success',
    runId: args.runId,
    appliedAt,
    changedFiles: report.changedFiles,
  };
}
