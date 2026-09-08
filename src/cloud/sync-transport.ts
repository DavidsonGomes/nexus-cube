import type { SyncOperation, SyncPullPage, SyncReceipt, SyncRejected, SyncTransport } from './sync-types';

export function createRPCSyncTransport(rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>): SyncTransport {
  return {
    status: async () => await rpc('nexus_sync_status', {}) as { revision: string },
    lookupSource: async sourceDigest => await rpc('nexus_sync_source', { source_digest: sourceDigest }) as { operationId: string | null },
    pull: async input => await rpc('nexus_sync_pull', { after_revision: input.afterRevision, upper_bound: input.upperBound, start_ordinal: input.ordinal }) as SyncPullPage,
    push: async (operation: SyncOperation) => {
      const payload = JSON.stringify(operation);
      if (payload.length <= 131072) return await rpc('nexus_sync_push', { operation }) as SyncReceipt | SyncRejected;
      // ASCII wire only. Chunks are invisible until one atomic finalize.
      const chunks = Math.ceil(payload.length / 131072);
      const manifest = { operationId: operation.operationId, requestDigest: operation.requestDigest, bytes: payload.length, chunks };
      await rpc('nexus_sync_stage_begin', { manifest });
      const stage = await rpc('nexus_sync_stage_status', { operation_id: operation.operationId }) as { status: string; requestDigest: string };
      if (stage.requestDigest !== operation.requestDigest) throw new Error('Stage identity mismatch');
      if (stage.status === 'finalized' || stage.status === 'conflicted') return await rpc('nexus_sync_stage_finalize', { operation_id: operation.operationId }) as SyncReceipt | SyncRejected;
      if (stage.status !== 'receiving') throw new Error('Stage closed; a new confirmed plan is required');
      for (let index = 0; index < chunks; index++) await rpc('nexus_sync_stage_chunk', { operation_id: operation.operationId, chunk_index: index, chunk: payload.slice(index * 131072, (index + 1) * 131072) });
      return await rpc('nexus_sync_stage_finalize', { operation_id: operation.operationId }) as SyncReceipt | SyncRejected;
    },
  };
}
