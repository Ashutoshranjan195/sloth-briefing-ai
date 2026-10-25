import type {
  ConnectionTestResult,
  HealthResponse,
  HistoryResponse,
  Report,
  RepositoryValidation,
  Settings,
} from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError('The local API is unavailable. Start the FastAPI server on port 8000.', 0)
  }

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    const detail = typeof payload === 'object' && payload !== null && 'detail' in payload ? payload.detail : payload
    const message = typeof detail === 'string' && detail.trim() ? detail : `Request failed with status ${response.status}.`
    throw new ApiError(message, response.status)
  }

  return payload as T
}

function jsonRequest(method: 'POST' | 'PUT', body?: unknown): RequestInit {
  return {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  }
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  getSettings: () => request<Settings>('/api/settings'),
  saveSettings: (settings: Pick<Settings, 'endpoint' | 'model' | 'timeout'>) =>
    request<Settings>('/api/settings', jsonRequest('PUT', settings)),
  testConnection: () => request<ConnectionTestResult>('/api/settings/test-connection', jsonRequest('POST')),
  validateRepository: (path: string) =>
    request<RepositoryValidation>('/api/repositories/validate', jsonRequest('POST', { path })),
  createScan: (path: string) => request<Report>('/api/scans', jsonRequest('POST', { path })),
  getScan: (id: string) => request<Report>(`/api/scans/${encodeURIComponent(id)}`),
  createBriefing: (id: string) => request<Report>(`/api/scans/${encodeURIComponent(id)}/briefing`, jsonRequest('POST')),
  getHistory: (limit = 50) => request<HistoryResponse>(`/api/history?limit=${limit}`),
  deleteHistory: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
