const TOKEN_KEY = 'safetyops.token'

// Fired when the server rejects the stored token, so the app can sign out.
export const UNAUTHORIZED_EVENT = 'safetyops:unauthorized'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage unavailable (private mode); the session lasts until reload.
  }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

// Calls the SafetyOps API (paths are relative to /api) with the signed-in
// user's token. Throws ApiError with the server's message on non-2xx.
export async function api<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const data = await res.json().catch(() => null)

  if (res.status === 401 && token) {
    setToken(null)
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status)
  }
  return data as T
}
