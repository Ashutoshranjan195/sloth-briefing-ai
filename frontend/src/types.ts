export const CHECK_STATUSES = ['PASS', 'FAIL', 'WARN', 'SKIPPED', 'UNSUPPORTED'] as const

export type CheckStatus = (typeof CHECK_STATUSES)[number]

export interface PrivacySettings {
  localOnly: boolean
  sourceFilesSent: boolean
  repositoryCodeExecuted: boolean
}

export interface Settings {
  endpoint: string
  model: string
  timeout: number
  allowedRoots: string[]
  privacy: PrivacySettings
}

export interface HealthResponse extends Settings {
  status: string
  service: string
  version: string
  historyCount: number
}

export interface Check {
  id: string
  name: string
  status: CheckStatus
  explanation: string
  evidence: string[]
  remediation: string
}

export type Summary = Record<CheckStatus, number>

export interface BriefingAction {
  check_id: string
  action: string
  why: string
  effort: 'low' | 'medium' | 'high' | string
}

export interface Briefing {
  headline: string
  summary: string
  actions: BriefingAction[]
}

export interface Report {
  id: string
  createdAt: string
  status: string
  completedAt: string
  durationMs: number
  repository: string
  repositoryName: string
  summary: Summary
  checks: Check[]
  briefing: Briefing | null
  hasBriefing: boolean
  briefingModel?: string
}

export interface RepositoryValidation {
  valid: boolean
  path: string
  name: string
  authorized: boolean
}

export interface ConnectionTestResult {
  status: 'connected' | 'unavailable'
  model: string
  reachable?: boolean
  modelAvailable?: boolean
  models?: string[]
  error?: string
}

export interface HistoryResponse {
  items: Report[]
}
