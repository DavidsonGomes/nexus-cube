/** Fixtures sintéticas para QA local AUTH + CORE. Sem tokens, emails, IDs ou dados reais. */
export type SyntheticIdentity = { id: string; label: 'guest' | 'user-a' | 'user-b' };
export type SyntheticAuthState = 'anonymous' | 'pending-confirmation' | 'authenticated' | 'expired';
export const identities: readonly SyntheticIdentity[] = [
  { id: 'synthetic-guest', label: 'guest' },
  { id: 'synthetic-user-a', label: 'user-a' },
  { id: 'synthetic-user-b', label: 'user-b' },
];
export const authStates: readonly SyntheticAuthState[] = ['anonymous', 'pending-confirmation', 'authenticated', 'expired'];
export const localKeys = (identity: SyntheticIdentity) => ({
  root: `nexus-cube:identity:${identity.id}`,
  recovery: `nexus-cube:recovery:${identity.id}`,
  draft: `nexus-cube:draft:${identity.id}`,
});
export const syntheticCoreSnapshot = (identity: SyntheticIdentity) => ({
  identity: identity.id,
  version: 3,
  sessions: [],
  solves: [],
  activeSessionId: null,
  mode: null,
});
