export interface StoredToken {
  accessToken: string;
  expiresAt: number;
  userInfo?: {
    name?: string;
    email?: string;
    sub?: string;
    accountName?: string;
    accountId?: string;
  };
}

let stored: StoredToken | null = null;

export function setToken(token: StoredToken): void {
  stored = token;
}

export function getToken(): StoredToken | null {
  if (!stored) return null;
  if (stored.expiresAt <= Date.now()) {
    stored = null;
    return null;
  }
  return stored;
}

export function clearToken(): void {
  stored = null;
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}
