import { DataV4LimitError, preflightDataV4, verifyImportSourcesV4, type AppData4 } from '../data/imported-model';
import type { ImportPlanHandle, ImportPlanManifest, ImportPlanningService, ImportTarget } from '../imports/plan-types';
import { canonicalText, digest } from './codec';
import type { ContextHandle } from './types';

declare const preparedBrand: unique symbol;
export interface PreparedImportV4 { readonly [preparedBrand]: true }
export type ImportCommitFailureV4 = { kind: 'invalid' | 'stale-local' | 'identity-changed' | 'locked' | 'busy-capture' | 'unsupported-version' | 'plan-diverged' | 'limit-exceeded' };
export interface ImportReceiptV4 { planId: string; planSHA256: string; rawSHA256: string; semanticSHA256: string; committedRevision: number }
/** Part of the future versioned CloudAtomicStore workspace, never a second store. */
export interface ImportWorkspaceV4 {
  domainVersion: 4;
  data: AppData4;
  revision: number;
  importReceipts: Record<string, ImportReceiptV4>;
  pendingImports: Record<string, ImportPlanManifest>;
  syncNeedsReconciliation: boolean;
}
/** Supplied only by the repository inside its serialized transaction. */
export interface ImportTransactionViewV4 {
  context: ContextHandle;
  gate: 'active' | 'guest' | 'locked' | 'recovery';
  busyCapture: boolean;
  workspace: ImportWorkspaceV4;
}
export type ImportAppliedV4 = { kind: 'committed' | 'already-committed'; data: AppData4; localRevision: number; committedRevision: number; context: ContextHandle; planId: string; sync: 'unavailable' };
interface PrivatePreparation {
  context: ContextHandle;
  plan: ImportPlanHandle;
  manifest: ImportPlanManifest;
  manifestCanonical: string;
  candidateJSON: string;
  expectedJSON: string;
}
const same = (a: ContextHandle, b: ContextHandle) => a.projectRef === b.projectRef && a.userId === b.userId && a.generation === b.generation;

/** Executable preparation/transaction reducer only. It opens no IDB, Auth or network.
 * The caller MUST run applyInTransaction inside the existing atomic store and wait
 * for transaction.complete, then revalidate context before publishing any result.
 * No AppData3 adapter, durable staging/reopening or V4 dispatch is implied here.
 */
export function createImportCommitProtocolV4(planning: ImportPlanningService) {
  const prepared = new WeakMap<PreparedImportV4, PrivatePreparation>();
  return {
    async prepare(input: { context: ContextHandle; target: ImportTarget; plan: ImportPlanHandle }): Promise<{ kind: 'prepared'; prepared: PreparedImportV4 } | { kind: 'already-applied'; planId: string } | ImportCommitFailureV4> {
      const context = { ...input.context }, plan = input.plan;
      try {
        const target = structuredClone(input.target);
        if (target.data.version !== 4) return { kind: 'unsupported-version' };
        const manifest = planning.readPlanManifest(plan);
        if (!manifest) return { kind: 'invalid' };
        if (manifest.protocolVersion !== 1 || manifest.domainVersion !== 4 || manifest.canonicalVersion !== 1 || manifest.strategy !== 'append') return { kind: 'unsupported-version' };
        const frozenManifest = structuredClone(manifest), manifestCanonical = canonicalText(frozenManifest);
        const before = preflightDataV4(target.data);
        const result = planning.applyPlan({ data: before.data, localRevision: target.localRevision }, plan);
        if (result.kind === 'already-applied') return { kind: 'already-applied', planId: result.planId };
        if (result.kind === 'stale') return { kind: 'stale-local' };
        if (result.kind !== 'applied') return { kind: result.kind };
        const candidate = preflightDataV4(result.data);
        if (frozenManifest.planId !== result.planId || frozenManifest.planId !== `imp_${frozenManifest.planSHA256}` || frozenManifest.expectedLocalRevision !== target.localRevision) return { kind: 'plan-diverged' };
        await verifyImportSourcesV4(candidate.data);
        const targetHash = await digest(['nexus-cube/import-target/v1', target.localRevision, before.data]);
        const planHash = await digest(['nexus-cube/import-plan/v1', frozenManifest.semanticSHA256, frozenManifest.rawSHA256, frozenManifest.targetDigest, frozenManifest.expectedLocalRevision,
          { choices: frozenManifest.choices, duplicateOf: frozenManifest.duplicateOf }, frozenManifest.records, frozenManifest.idMappings, frozenManifest.importedAt, frozenManifest.nonce]);
        if (targetHash !== `sha256:${frozenManifest.targetDigest}` || planHash !== `sha256:${frozenManifest.planSHA256}`) return { kind: 'plan-diverged' };
        const currentManifest = planning.readPlanManifest(plan);
        if (!currentManifest || canonicalText(currentManifest) !== manifestCanonical) return { kind: 'invalid' };
        const token = Object.freeze({}) as PreparedImportV4;
        prepared.set(token, { context, plan, manifest: frozenManifest, manifestCanonical, candidateJSON: candidate.snapshotJSON, expectedJSON: before.snapshotJSON });
        return { kind: 'prepared', prepared: token };
      } catch (error) { return { kind: error instanceof DataV4LimitError ? 'limit-exceeded' : 'invalid' }; }
    },
    applyInTransaction(view: ImportTransactionViewV4, token: PreparedImportV4): ImportAppliedV4 | ImportCommitFailureV4 {
      const entry = prepared.get(token);
      if (!entry) return { kind: 'invalid' };
      if (!same(view.context, entry.context)) return { kind: 'identity-changed' };
      if (view.gate !== 'active' && view.gate !== 'guest') return { kind: 'locked' };
      if (view.busyCapture) return { kind: 'busy-capture' };
      const workspace = view.workspace;
      if (workspace.domainVersion !== 4 || workspace.data.version !== 4) return { kind: 'unsupported-version' };
      let writing = false;
      try {
        const manifest = planning.readPlanManifest(entry.plan);
        if (!manifest || canonicalText(manifest) !== entry.manifestCanonical) return { kind: 'invalid' };
        const receipt = workspace.importReceipts[manifest.planId];
        const applied = planning.applyPlan({ data: workspace.data, localRevision: workspace.revision }, entry.plan);
        if (receipt) {
          if (receipt.planId !== manifest.planId || receipt.planSHA256 !== manifest.planSHA256 || receipt.rawSHA256 !== manifest.rawSHA256 || receipt.semanticSHA256 !== manifest.semanticSHA256 || applied.kind !== 'already-applied') return { kind: 'plan-diverged' };
          return { kind: 'already-committed', context: { ...entry.context }, data: structuredClone(applied.data), localRevision: workspace.revision, committedRevision: receipt.committedRevision, planId: manifest.planId, sync: 'unavailable' };
        }
        if (workspace.revision !== manifest.expectedLocalRevision || preflightDataV4(workspace.data).snapshotJSON !== entry.expectedJSON || applied.kind === 'stale') return { kind: 'stale-local' };
        if (applied.kind !== 'applied') return { kind: applied.kind === 'limit-exceeded' ? 'limit-exceeded' : 'plan-diverged' };
        const candidate = preflightDataV4(applied.data);
        if (candidate.snapshotJSON !== entry.candidateJSON) return { kind: 'plan-diverged' };
        if (!Number.isSafeInteger(workspace.revision) || workspace.revision < 0 || !Number.isSafeInteger(workspace.revision + 1)) return { kind: 'invalid' };
        const revision = workspace.revision + 1;
        // All values are ready before mutating the transaction's private state.
        const next = structuredClone(candidate.data);
        const pending = structuredClone(manifest);
        const saved: ImportReceiptV4 = { planId: manifest.planId, planSHA256: manifest.planSHA256, rawSHA256: manifest.rawSHA256, semanticSHA256: manifest.semanticSHA256, committedRevision: revision };
        const response: ImportAppliedV4 = { kind: 'committed', context: { ...entry.context }, data: structuredClone(next), localRevision: revision, committedRevision: revision, planId: manifest.planId, sync: 'unavailable' };
        writing = true;
        workspace.data = next;
        workspace.revision = revision;
        workspace.importReceipts[manifest.planId] = saved;
        workspace.pendingImports[manifest.planId] = pending;
        workspace.syncNeedsReconciliation = true;
        return response;
      } catch (error) { if (writing) throw error; return { kind: error instanceof DataV4LimitError ? 'limit-exceeded' : 'invalid' }; }
    },
    release(token: PreparedImportV4): boolean { return prepared.delete(token); },
  };
}
