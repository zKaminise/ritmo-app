import { QueryClient, useQuery } from '@tanstack/react-query';
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: true } },
});
const prefix = 'ritmo:cache:';
function cacheKey(path: string) {
  return `${prefix}${localStorage.getItem('ritmo:user') ?? 'guest'}:${path}`;
}
export function clearPrivateCache(resetQueries = true) {
  for (const key of Object.keys(localStorage))
    if (key.startsWith(prefix)) localStorage.removeItem(key);
  localStorage.removeItem('ritmo:user');
  if (resetQueries) {
    void queryClient.cancelQueries();
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== '/auth/me' });
    queryClient.setQueryData(['/auth/me'], null);
  }
}
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const cached = method === 'GET' ? localStorage.getItem(cacheKey(path)) : null;
  if (!navigator.onLine) {
    if (cached && method === 'GET') return JSON.parse(cached) as T;
    throw new ApiError('Você está offline. Conecte-se para salvar alterações.', 0);
  }
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Não conseguimos conectar ao Ritmo. Tente novamente.', 0);
  }
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path === '/auth/me') clearPrivateCache(false);
    throw new ApiError(
      value && typeof value === 'object' && 'message' in value
        ? String(value.message)
        : 'Não conseguimos completar esta ação. Tente novamente.',
      response.status,
    );
  }
  if (method === 'GET' && !path.startsWith('/push') && !path.startsWith('/reminders')) {
    try {
      localStorage.setItem(cacheKey(path), JSON.stringify(value));
    } catch {
      /* Agenda continua funcionando quando o armazenamento local está cheio. */
    }
  }
  return value as T;
}
export function useData<T>(path: string, enabled = true, refetchInterval?: number) {
  return useQuery<T>({ queryKey: [path], queryFn: () => api<T>(path), enabled, refetchInterval });
}
