import { createApiCloudService } from './api-service';
import type { StorageLike } from '../data';
export * from './types';
export * from './sync-types';
export { createApiCloudService } from './api-service';
export { createCloudServiceWithPorts, type CloudServicePorts } from './service';
export { createIndexedDBCloudStore, createMemoryCloudStore, initialCloudState, type CloudAtomicStore, type CloudState } from './storage';

export interface CloudOptions { url?: string; publishableKey?: string; redirectTo?: string; guestStorage?: StorageLike; syncEnabled?: boolean }
export function createCloudService(_options: CloudOptions = {}) {
  return createApiCloudService();
}
