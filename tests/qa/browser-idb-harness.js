// Harness somente para Portal Sonda em DEV. Não é importado pelo produto nem pelo build de produção.
// Executar apenas sob freeze: importar este módulo via avaliação do portal DEV 127.0.0.1:3000.
export async function createBrowserIdbHarness() {
  const [{ createCloudServiceWithPorts }, { createIndexedDBCloudStore }, { createInitialData, exportBackup }, { createSession }] = await Promise.all([
    import('/src/cloud/service.ts'),
    import('/src/cloud/storage.ts'),
    import('/src/data/store.ts'),
    import('/src/data/mutations.ts'),
  ]);
  const projectRef = `qa-r1-idb-${crypto.randomUUID()}`;
  const store = createIndexedDBCloudStore(projectRef);
  const authUsers = new Map();
  let lastIdentity = null;
  const authFactory = ({ storageKey }) => {
    const listeners = new Set();
    let current = authUsers.get(storageKey) ?? lastIdentity;
    return {
      signUp: async (email, _password) => { current = { id: email.startsWith('b@') ? 'qa-user-b' : 'qa-user-a', email }; authUsers.set(storageKey, current); lastIdentity = current; return current; },
      signIn: async (email, _password) => { current = { id: email.startsWith('b@') ? 'qa-user-b' : 'qa-user-a', email }; authUsers.set(storageKey, current); lastIdentity = current; return current; },
      getUser: async () => current,
      resetPassword: async () => undefined, exchangeCode: async () => current ?? { id: 'qa-user-a', email: null },
      updatePassword: async () => undefined, signOut: async () => undefined,
      refresh: async () => current, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      dispose: () => listeners.clear(),
    };
  };
  const guest = createInitialData();
  const guestStorage = { value: exportBackup(guest), getItem: () => JSON.stringify(guest), setItem: (_key, value) => { guestStorage.value = value; } };
  const options = { projectRef, authFactory, store, guestStorage, online: () => true, redirectTo: 'http://127.0.0.1:3000/auth' };
  const first = createCloudServiceWithPorts(options);
  const second = createCloudServiceWithPorts({ ...options, store: createIndexedDBCloudStore(projectRef) });
  await first.initialize(); await second.initialize();
  async function assertControls() {
    const a = await first.signIn({ email: 'a@synthetic.invalid', password: 'x' });
    if (a.kind !== 'authenticated') throw new Error('QA IDB identity A control failed.');
    await first.signOut();
    const b = await second.signIn({ email: 'b@synthetic.invalid', password: 'x' });
    if (b.kind !== 'authenticated' || a.identity.id === b.identity.id) throw new Error('QA IDB identity control failed: A/B must differ.');
    const state = await store.read();
    if (!state.accounts['qa-user-a'] || !state.accounts['qa-user-b']) throw new Error('QA IDB account markers missing.');
    return { a: a.identity.id, b: b.identity.id, markers: Object.keys(state.accounts).sort() };
  }
  async function reopen() {
    const reopened = createCloudServiceWithPorts({ ...options, store: createIndexedDBCloudStore(projectRef) });
    await reopened.initialize();
    return reopened;
  }
  return {
    projectRef, first, second, store, guestStorage,
    syntheticData: createSession(createInitialData(), 'QA IDB session', 'two-handed'),
    assertControls, reopen, dispose: () => { first.dispose(); second.dispose(); },
  };
}
