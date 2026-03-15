import Conf from 'conf';

interface StoreSchema {
  token: string;
  login: string;
}

const store = new Conf<StoreSchema>({
  projectName: 'gh-search-replace',
  schema: {
    token: { type: 'string', default: '' },
    login: { type: 'string', default: '' },
  },
});

export const tokenStore = {
  get(): string | undefined {
    const token = store.get('token');
    return token || undefined;
  },

  set(token: string, login: string): void {
    store.set('token', token);
    store.set('login', login);
  },

  getLogin(): string | undefined {
    const login = store.get('login');
    return login || undefined;
  },

  clear(): void {
    store.delete('token');
    store.delete('login');
  },

  configPath(): string {
    return store.path;
  },
};
