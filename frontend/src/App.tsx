import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { api, ApiError } from './api'
import type {
  Briefing,
  Check,
  CheckStatus,
  ConnectionTestResult,
  HealthResponse,
  Report,
  Settings,
} from './types'
import './styles.css'

type View = 'overview' | 'history' | 'settings'
type SeverityFilter = 'ALL' | 'FAIL' | 'WARN' | 'PASS'
type StatusFilter = 'ALL' | 'ACTIONABLE' | 'CLEAR' | 'NOT_RUN' | 'UNSUPPORTED'
type SortBy = 'priority' | 'name' | 'status' | 'evidence'
type ScanPhase = 'idle' | 'validating' | 'scanning'
type BriefingPhase = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
type ConnectionPhase = 'idle' | 'testing' | 'connected' | 'model-missing' | 'unavailable'

type IconName =
  | 'activity'
  | 'arrow-up-right'
  | 'check'
  | 'chevron-down'
  | 'clock'
  | 'copy'
  | 'close'
  | 'download'
  | 'external'
  | 'folder'
  | 'github'
  | 'history'
  | 'lock'
  | 'menu'
  | 'model'
  | 'refresh'
  | 'scan'
  | 'search'
  | 'settings'
  | 'spark'
  | 'trash'
  | 'warning'

const EMPTY_SETTINGS: Settings = {
  endpoint: '',
  model: '',
  timeout: 30,
  allowedRoots: [],
  privacy: {
    localOnly: true,
    sourceFilesSent: false,
    repositoryCodeExecuted: false,
  },
}

const STATUS_META: Record<CheckStatus, { label: string; description: string }> = {
  PASS: { label: 'PASS', description: 'Verified evidence' },
  FAIL: { label: 'FAIL', description: 'Needs maintenance' },
  WARN: { label: 'WARN', description: 'Worth a closer look' },
  SKIPPED: { label: 'SKIPPED', description: 'Not evaluated' },
  UNSUPPORTED: { label: 'UNSUPPORTED', description: 'No matching signal' },
}

const PRIORITY: Record<CheckStatus, number> = {
  FAIL: 0,
  WARN: 1,
  SKIPPED: 2,
  UNSUPPORTED: 3,
  PASS: 4,
}

const NAV_ITEMS: { id: View; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', icon: 'activity' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'activity':
      return (
        <svg {...common}>
          <path d="M3 12h4l2.2-7 4.2 14L16 12h5" />
          <path d="M5 5.5h.01M19 18.5h.01" />
        </svg>
      )
    case 'arrow-up-right':
      return (
        <svg {...common}>
          <path d="M7 17 17 7M8 7h9v9" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      )
    case 'chevron-down':
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      )
    case 'copy':
      return (
        <svg {...common}>
          <rect x="8" y="8" width="10" height="11" rx="1.5" />
          <path d="M16 8V6.5A1.5 1.5 0 0 0 14.5 5h-8A1.5 1.5 0 0 0 5 6.5v8A1.5 1.5 0 0 0 6.5 16H8" />
        </svg>
      )
    case 'close':
      return (
        <svg {...common}>
          <path d="m7 7 10 10M17 7 7 17" />
        </svg>
      )
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 4v10M8 10l4 4 4-4M5 19h14" />
        </svg>
      )
    case 'external':
      return (
        <svg {...common}>
          <path d="M14 5h5v5M19 5l-8 8" />
          <path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
        </svg>
      )
    case 'folder':
      return (
        <svg {...common}>
          <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
          <path d="M3.5 10h17" />
        </svg>
      )
    case 'github':
      return (
        <svg {...common}>
          <path d="M9 19.5c-4.1 1.2-4.1-2.1-5.8-2.5M14.8 19.5v-2.9a2.5 2.5 0 0 0-.7-1.9c2.3-.3 4.7-1.1 4.7-5a3.9 3.9 0 0 0-1-2.7 3.6 3.6 0 0 0-.1-2.7s-.8-.3-2.8 1a9.5 9.5 0 0 0-5.1 0c-2-1.3-2.8-1-2.8-1a3.6 3.6 0 0 0-.1 2.7 3.9 3.9 0 0 0-1 2.7c0 3.9 2.4 4.7 4.7 5a2.5 2.5 0 0 0-.7 1.9v2.9" />
          <path d="M8.5 22h7a6.5 6.5 0 0 0 6.5-6.5v-7A6.5 6.5 0 0 0 15.5 2h-7A6.5 6.5 0 0 0 2 8.5v7A6.5 6.5 0 0 0 8.5 22Z" />
        </svg>
      )
    case 'history':
      return (
        <svg {...common}>
          <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" />
          <path d="M4 4v4.6h4.6M12 8v4l2.7 1.7" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...common}>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
        </svg>
      )
    case 'menu':
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      )
    case 'model':
      return (
        <svg {...common}>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
        </svg>
      )
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 0 0-14.7-4L3 9" />
          <path d="M3 4v5h5M4 13a8 8 0 0 0 14.7 4L21 15" />
          <path d="M21 20v-5h-5" />
        </svg>
      )
    case 'scan':
      return (
        <svg {...common}>
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
          <path d="M7 12h10M12 7v10" />
        </svg>
      )
    case 'search':
      return (
        <svg {...common}>
          <circle cx="10.8" cy="10.8" r="6.3" />
          <path d="m16 16 4.2 4.2" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
          <path d="m19.3 13.8 1.2.9-1.8 3.1-1.4-.6a8.2 8.2 0 0 1-1.7 1l-.2 1.5h-3.6l-.2-1.5a8.2 8.2 0 0 1-1.7-1l-1.4.6-1.8-3.1 1.2-.9a8.1 8.1 0 0 1 0-2l-1.2-.9 1.8-3.1 1.4.6a8.2 8.2 0 0 1 1.7-1l.2-1.5h3.6l.2 1.5a8.2 8.2 0 0 1 1.7 1l1.4-.6 1.8 3.1-1.2.9a8.1 8.1 0 0 1 0 2Z" />
        </svg>
      )
    case 'spark':
      return (
        <svg {...common}>
          <path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4z" />
          <path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6z" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...common}>
          <path d="M5 7h14M10 4h4l1 3H9zM7 7l.8 13h8.4L17 7M10 11v5M14 11v5" />
        </svg>
      )
    case 'warning':
      return (
        <svg {...common}>
          <path d="m12 4 8 15H4z" />
          <path d="M12 9v4M12 16h.01" />
        </svg>
      )
    default:
      return null
  }
}

function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds)) return '—'
  if (milliseconds < 1000) return `${Math.max(0, Math.round(milliseconds))} ms`
  return `${(milliseconds / 1000).toFixed(1)} s`
}

function shortPath(value: string) {
  const parts = value.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 3) return value
  const prefix = value.startsWith('\\\\') ? '\\\\' : value.match(/^[A-Za-z]:[\\/]/)?.[0] ?? '/'
  return `${prefix}…/${parts.slice(-2).join('/')}`
}

function totalChecks(report: Report) {
  return report.checks.length
}

function statusGroup(status: CheckStatus): Exclude<StatusFilter, 'ALL'> {
  if (status === 'FAIL' || status === 'WARN') return 'ACTIONABLE'
  if (status === 'PASS') return 'CLEAR'
  if (status === 'SKIPPED') return 'NOT_RUN'
  return 'UNSUPPORTED'
}

function StatusBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`} title={STATUS_META[status].description}>
      <span className="status-dot" />
      {STATUS_META[status].label}
    </span>
  )
}

function App() {
  const [activeView, setActiveView] = useState<View>('overview')
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS)
  const [settingsDraft, setSettingsDraft] = useState({ endpoint: '', model: '', timeout: 30 })
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [history, setHistory] = useState<Report[]>([])
  const [startupState, setStartupState] = useState<'loading' | 'ready' | 'offline'>('loading')
  const [startupNotice, setStartupNotice] = useState<string | null>(null)
  const [scanPath, setScanPath] = useState('')
  const [scanPhase, setScanPhase] = useState<ScanPhase>('idle')
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanNotice, setScanNotice] = useState<string | null>(null)
  const [briefingPhase, setBriefingPhase] = useState<BriefingPhase>('idle')
  const [briefingError, setBriefingError] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyOpeningId, setHistoryOpeningId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>('idle')
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null)
  const [findingSearch, setFindingSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [sortBy, setSortBy] = useState<SortBy>('priority')

  useEffect(() => {
    let cancelled = false

    async function loadWorkspace() {
      const results = await Promise.allSettled([api.health(), api.getSettings(), api.getHistory()])
      if (cancelled) return

      const [healthResult, settingsResult, historyResult] = results
      let successfulRequests = 0

      if (healthResult.status === 'fulfilled') {
        successfulRequests += 1
        setHealth(healthResult.value)
      }

      if (settingsResult.status === 'fulfilled') {
        successfulRequests += 1
        const nextSettings = settingsResult.value
        setSettings(nextSettings)
        setSettingsDraft({
          endpoint: nextSettings.endpoint,
          model: nextSettings.model,
          timeout: nextSettings.timeout,
        })
      } else if (healthResult.status === 'fulfilled') {
        setSettings(healthResult.value)
        setSettingsDraft({
          endpoint: healthResult.value.endpoint,
          model: healthResult.value.model,
          timeout: healthResult.value.timeout,
        })
      }

      if (historyResult.status === 'fulfilled') {
        successfulRequests += 1
        setHistory(historyResult.value.items)
      }

      if (successfulRequests === 0) {
        setStartupState('offline')
        setStartupNotice('The FastAPI service is not responding. Start it on 127.0.0.1:8000, then refresh this page.')
      } else {
        setStartupState('ready')
        if (healthResult.status === 'rejected') {
          setStartupNotice('The local API responded partially. Health details will appear when the service is reachable.')
        }
      }
    }

    void loadWorkspace()
    return () => {
      cancelled = true
    }
  }, [])

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const result = await api.getHistory()
      setHistory(result.items)
    } catch (error) {
      setHistoryError(getErrorMessage(error, 'History could not be loaded.'))
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const handleScan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const requestedPath = scanPath.trim()
    if (!requestedPath) {
      setScanError('Enter an existing local repository directory first.')
      setScanNotice(null)
      return
    }

    setScanPhase('validating')
    setScanError(null)
    setScanNotice(null)
    try {
      const validation = await api.validateRepository(requestedPath)
      if (!validation.valid || !validation.authorized) {
        throw new ApiError('That directory is not authorized for scanning.', 422)
      }

      setScanPath(validation.path)
      setScanPhase('scanning')
      const nextReport = await api.createScan(validation.path)
      setReport(nextReport)
      setHistory((current) => [nextReport, ...current.filter((item) => item.id !== nextReport.id)])
      setHealth((current) => (current ? { ...current, historyCount: current.historyCount + 1 } : current))
      setBriefingPhase('idle')
      setBriefingError(null)
      setFindingSearch('')
      setSeverityFilter('ALL')
      setStatusFilter('ALL')
      setSortBy('priority')
      setActiveView('overview')
      setScanNotice(`Scan complete · ${nextReport.checks.length} checks recorded`)
    } catch (error) {
      setScanError(getErrorMessage(error, 'The repository scan could not be completed.'))
    } finally {
      setScanPhase('idle')
    }
  }

  const handleGenerateBriefing = async () => {
    if (!report) return
    setBriefingPhase('loading')
    setBriefingError(null)
    try {
      const updatedReport = await api.createBriefing(report.id)
      setReport(updatedReport)
      setHistory((current) => current.map((item) => (item.id === updatedReport.id ? updatedReport : item)))
      setBriefingPhase('ready')
    } catch (error) {
      const message = getErrorMessage(error, 'The local model did not return a usable briefing.')
      setBriefingError(message)
      setBriefingPhase(error instanceof ApiError && error.status === 503 ? 'unavailable' : 'error')
    }
  }

  const handleOpenHistory = async (id: string) => {
    setHistoryOpeningId(id)
    setHistoryError(null)
    try {
      const nextReport = await api.getScan(id)
      setReport(nextReport)
      setScanPath(nextReport.repository)
      setBriefingPhase(nextReport.hasBriefing ? 'ready' : 'idle')
      setBriefingError(null)
      setActiveView('overview')
    } catch (error) {
      setHistoryError(getErrorMessage(error, 'That saved scan could not be opened.'))
    } finally {
      setHistoryOpeningId(null)
    }
  }

  const handleDeleteHistory = async (id: string) => {
    setDeleteBusyId(id)
    setHistoryError(null)
    try {
      await api.deleteHistory(id)
      setHistory((current) => current.filter((item) => item.id !== id))
      if (report?.id === id) {
        setReport(null)
        setBriefingPhase('idle')
      }
      setConfirmDeleteId(null)
      setHealth((current) => (current ? { ...current, historyCount: Math.max(0, current.historyCount - 1) } : current))
    } catch (error) {
      setHistoryError(getErrorMessage(error, 'That saved scan could not be deleted.'))
    } finally {
      setDeleteBusyId(null)
    }
  }

  const handleSaveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSettingsSaving(true)
    setSettingsMessage(null)
    setSettingsError(null)
    try {
      const saved = await api.saveSettings({
        endpoint: settingsDraft.endpoint,
        model: settingsDraft.model,
        timeout: Number(settingsDraft.timeout),
      })
      setSettings(saved)
      setSettingsDraft({ endpoint: saved.endpoint, model: saved.model, timeout: saved.timeout })
      setHealth((current) => (current ? { ...current, ...saved } : current))
      setSettingsMessage('Settings saved locally.')
    } catch (error) {
      setSettingsError(getErrorMessage(error, 'Settings could not be saved.'))
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleConnectionTest = async () => {
    setConnectionPhase('testing')
    setConnectionResult(null)
    try {
      const result = await api.testConnection()
      setConnectionResult(result)
      setConnectionPhase(
        result.status === 'connected'
          ? result.modelAvailable === false
            ? 'model-missing'
            : 'connected'
          : 'unavailable',
      )
    } catch (error) {
      setConnectionPhase('unavailable')
      setConnectionResult({ status: 'unavailable', model: settingsDraft.model, error: getErrorMessage(error) })
    }
  }

  const handleExport = () => {
    if (!report) return
    const filename = `${report.repositoryName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'scan'}-${report.id.slice(0, 8)}.json`
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const filteredFindings = useMemo(() => {
    if (!report) return []
    const query = findingSearch.trim().toLowerCase()
    return [...report.checks]
      .filter((check) => {
        const matchesSearch =
          !query ||
          [check.id, check.name, check.explanation, check.remediation, ...check.evidence]
            .join(' ')
            .toLowerCase()
            .includes(query)
        const matchesSeverity = severityFilter === 'ALL' || check.status === severityFilter
        const matchesStatus = statusFilter === 'ALL' || statusGroup(check.status) === statusFilter
        return matchesSearch && matchesSeverity && matchesStatus
      })
      .sort((left, right) => {
        if (sortBy === 'name') return left.name.localeCompare(right.name)
        if (sortBy === 'status') return left.status.localeCompare(right.status) || left.name.localeCompare(right.name)
        if (sortBy === 'evidence') return right.evidence.length - left.evidence.length || left.name.localeCompare(right.name)
        return PRIORITY[left.status] - PRIORITY[right.status] || left.name.localeCompare(right.name)
      })
  }, [findingSearch, report, severityFilter, sortBy, statusFilter])

  const apiLabel = startupState === 'loading' ? 'Connecting to local API' : startupState === 'offline' ? 'API unavailable' : 'Local API connected'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </div>
          <div>
            <div className="brand-name">sloth briefing</div>
            <div className="brand-subtitle">local repository intelligence</div>
          </div>
        </div>

        <div className="sidebar-section-label">Workspace</div>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          {NAV_ITEMS.map((item) => (
            <button
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              aria-current={activeView === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
              {item.id === 'history' && history.length > 0 ? <span className="nav-count">{history.length}</span> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className={`connection-card connection-${startupState}`}>
          <div className="connection-card-top">
            <span className="connection-light" />
            <span>{apiLabel}</span>
          </div>
          <p>{startupState === 'offline' ? 'Start FastAPI to scan locally.' : 'Your scan evidence stays on this machine.'}</p>
        </div>
        <a className="github-link" href="https://github.com/Ashutoshranjan195/sloth-briefing-ai" target="_blank" rel="noreferrer">
          <span className="github-glyph" aria-hidden="true"><Icon name="github" size={17} /></span>
          <span>View on GitHub</span>
          <Icon name="external" size={14} />
        </a>
        <div className="sidebar-footer">
          <span>v0.2 workspace</span>
          <span className="footer-rule" />
          <span>offline-first</span>
        </div>
      </aside>

      <main className="workspace">
        <div className="mobile-topbar">
          <div className="brand-lockup compact">
            <div className="brand-mark" aria-hidden="true">
              <span />
              <span />
            </div>
            <div className="brand-name">sloth briefing</div>
          </div>
          <div className="mobile-nav" aria-label="Workspace navigation">
            {NAV_ITEMS.map((item) => (
              <button
                className={`mobile-nav-item ${activeView === item.id ? 'active' : ''}`}
                type="button"
                key={item.id}
                onClick={() => setActiveView(item.id)}
                aria-label={item.label}
                aria-current={activeView === item.id ? 'page' : undefined}
              >
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="workspace-inner">
          <header className="workspace-header">
            <div className="header-topline">
              <div className="header-kicker">
                <span className="kicker-mark" />
                <span>Evidence-first developer workspace</span>
              </div>
              <div className="header-status">
                <span className={`mini-status-dot ${startupState}`} />
                <span>{startupState === 'ready' ? 'LOCAL API READY' : startupState === 'loading' ? 'CONNECTING' : 'OFFLINE'}</span>
              </div>
            </div>
            <div className="header-main">
              <div className="header-copy">
                <p className="eyebrow">{activeView === 'overview' ? 'Repository overview' : activeView === 'history' ? 'Saved scan history' : 'Local model settings'}</p>
                <h1>{report && activeView === 'overview' ? report.repositoryName : activeView === 'history' ? 'Retained evidence' : activeView === 'settings' ? 'Connection, kept local' : 'Repository health, minus the noise'}</h1>
                <p className="header-description">
                  {report && activeView === 'overview'
                    ? <span className="mono-text">{shortPath(report.repository)}</span>
                    : activeView === 'history'
                      ? 'Open a real prior scan or clear records you no longer need.'
                      : activeView === 'settings'
                        ? 'Tune the OpenAI-compatible local endpoint used for optional briefings.'
                        : 'Scan one authorized directory to get deterministic checks and grounded next steps.'}
                </p>
              </div>
              <div className="header-actions">
                {report ? (
                  <button className="button button-secondary" type="button" onClick={handleExport}>
                    <Icon name="download" size={16} />
                    Export JSON
                  </button>
                ) : null}
                <button className="button button-quiet" type="button" onClick={() => setActiveView('settings')}>
                  <Icon name="settings" size={16} />
                  Configure
                </button>
              </div>
            </div>

            <form className="scan-bar" onSubmit={handleScan}>
              <div className="scan-input-wrap">
                <Icon name="folder" size={17} />
                <label className="sr-only" htmlFor="repository-path">Repository path</label>
                <input
                  id="repository-path"
                  value={scanPath}
                  onChange={(event) => {
                    setScanPath(event.target.value)
                    setScanError(null)
                    setScanNotice(null)
                  }}
                  placeholder="C:\\path\\to\\repository"
                  autoComplete="off"
                  spellCheck={false}
                />
                {scanPath ? (
                  <button className="input-clear" type="button" onClick={() => setScanPath('')} aria-label="Clear repository path">
                    <Icon name="close" size={15} />
                  </button>
                ) : null}
              </div>
              <button className="button button-primary scan-button" type="submit" disabled={scanPhase !== 'idle'}>
                {scanPhase !== 'idle' ? <span className="button-spinner" /> : <Icon name="scan" size={16} />}
                {scanPhase === 'validating' ? 'Checking path…' : scanPhase === 'scanning' ? 'Scanning…' : 'Scan repository'}
              </button>
            </form>
            <div className="path-helper">
              <span className="path-helper-label"><Icon name="lock" size={13} /> Authorized roots</span>
              <span className="mono-text">{settings.allowedRoots.length ? settings.allowedRoots.join(' · ') : startupState === 'loading' ? 'Loading…' : 'No roots reported'}</span>
            </div>
            {scanError ? <InlineNotice tone="error" icon="warning">{scanError}</InlineNotice> : null}
            {scanNotice ? <InlineNotice tone="success" icon="check">{scanNotice}</InlineNotice> : null}
          </header>

          {startupNotice ? <InlineNotice tone={startupState === 'offline' ? 'error' : 'info'} icon={startupState === 'offline' ? 'warning' : 'activity'}>{startupNotice}</InlineNotice> : null}

          {activeView === 'overview' ? (
            <OverviewView
              report={report}
              historyCount={history.length}
              filteredFindings={filteredFindings}
              findingSearch={findingSearch}
              setFindingSearch={setFindingSearch}
              severityFilter={severityFilter}
              setSeverityFilter={setSeverityFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
              briefingPhase={briefingPhase}
              briefingError={briefingError}
              onGenerateBriefing={handleGenerateBriefing}
              onExport={handleExport}
            />
          ) : null}
          {activeView === 'history' ? (
            <HistoryView
              history={history}
              loading={historyLoading || startupState === 'loading'}
              error={historyError}
              openingId={historyOpeningId}
              confirmDeleteId={confirmDeleteId}
              deleteBusyId={deleteBusyId}
              onRefresh={refreshHistory}
              onOpen={handleOpenHistory}
              onRequestDelete={setConfirmDeleteId}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onDelete={handleDeleteHistory}
            />
          ) : null}
          {activeView === 'settings' ? (
            <SettingsView
              settings={settings}
              draft={settingsDraft}
              saving={settingsSaving}
              message={settingsMessage}
              error={settingsError}
              connectionPhase={connectionPhase}
              connectionResult={connectionResult}
              onChange={(event) => {
                const { name, value } = event.target
                setSettingsDraft((current) => ({
                  ...current,
                  [name]: name === 'timeout' ? Number(value) : value,
                }))
                setSettingsMessage(null)
                setSettingsError(null)
              }}
              onSave={handleSaveSettings}
              onTest={handleConnectionTest}
            />
          ) : null}
        </div>
      </main>
    </div>
  )
}

function InlineNotice({ tone, icon, children }: { tone: 'error' | 'success' | 'info'; icon: IconName; children: ReactNode }) {
  return (
    <div className={`inline-notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} size={15} />
      <span>{children}</span>
    </div>
  )
}

function OverviewView({
  report,
  historyCount,
  filteredFindings,
  findingSearch,
  setFindingSearch,
  severityFilter,
  setSeverityFilter,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  briefingPhase,
  briefingError,
  onGenerateBriefing,
  onExport,
}: {
  report: Report | null
  historyCount: number
  filteredFindings: Check[]
  findingSearch: string
  setFindingSearch: (value: string) => void
  severityFilter: SeverityFilter
  setSeverityFilter: (value: SeverityFilter) => void
  statusFilter: StatusFilter
  setStatusFilter: (value: StatusFilter) => void
  sortBy: SortBy
  setSortBy: (value: SortBy) => void
  briefingPhase: BriefingPhase
  briefingError: string | null
  onGenerateBriefing: () => void
  onExport: () => void
}) {
  if (!report) {
    return (
      <div className="view-stack overview-empty">
        <section className="empty-panel panel-surface">
          <div className="empty-panel-grid" aria-hidden="true" />
          <div className="empty-mark"><Icon name="scan" size={24} /></div>
          <p className="eyebrow">READY WHEN YOU ARE</p>
          <h2>Start with one local repository.</h2>
          <p className="empty-copy">Sloth reads deterministic signals from an authorized directory, then keeps the evidence in this workspace so maintenance feels smaller than the backlog.</p>
          <div className="empty-points">
            <div><span className="point-index">01</span><span>Verify package, runtime, Git, and documentation signals.</span></div>
            <div><span className="point-index">02</span><span>Inspect the exact evidence behind every finding.</span></div>
            <div><span className="point-index">03</span><span>Ask a local model for a short, grounded briefing when ready.</span></div>
          </div>
          <div className="empty-footer">
            <span className="mono-text">no scan loaded</span>
            <span className="empty-footer-rule" />
            <span className="mono-text">{historyCount} saved scan{historyCount === 1 ? '' : 's'}</span>
          </div>
        </section>
        <section className="empty-support-grid">
          <div className="support-note panel-surface">
            <span className="support-icon"><Icon name="lock" size={16} /></span>
            <div><p className="eyebrow">LOCAL BOUNDARY</p><h3>Source files stay out of the model prompt.</h3><p>The scanner sends the repository name and structured results only.</p></div>
          </div>
          <div className="support-note panel-surface">
            <span className="support-icon support-icon-lavender"><Icon name="spark" size={16} /></span>
            <div><p className="eyebrow">OPTIONAL AI</p><h3>Briefings explain evidence; they do not replace it.</h3><p>The deterministic scan is useful with or without a running local model.</p></div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="view-stack">
      <div className="overview-grid">
        <section className="summary-panel panel-surface">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">LATEST DETERMINISTIC SCAN</p>
              <h2>Signal at a glance</h2>
            </div>
            <StatusBadge status={report.summary.FAIL > 0 ? 'FAIL' : report.summary.WARN > 0 ? 'WARN' : 'PASS'} />
          </div>
          <div className="metric-grid">
            {(['PASS', 'FAIL', 'WARN', 'SKIPPED', 'UNSUPPORTED'] as CheckStatus[]).map((status) => (
              <div className={`metric-tile metric-${status.toLowerCase()}`} key={status}>
                <span className="metric-label">{status}</span>
                <strong>{report.summary[status] ?? 0}</strong>
                <span className="metric-description">{STATUS_META[status].description}</span>
              </div>
            ))}
          </div>
          <div className="scan-meta">
            <div><span>Scanned</span><strong>{formatDate(report.completedAt || report.createdAt)}</strong></div>
            <div><span>Duration</span><strong>{formatDuration(report.durationMs)}</strong></div>
            <div><span>Report ID</span><strong className="mono-text">{report.id.slice(0, 12)}</strong></div>
          </div>
        </section>
        <BriefingPanel report={report} phase={briefingPhase} error={briefingError} onGenerate={onGenerateBriefing} />
      </div>

      <FindingsExplorer
        report={report}
        filteredFindings={filteredFindings}
        findingSearch={findingSearch}
        setFindingSearch={setFindingSearch}
        severityFilter={severityFilter}
        setSeverityFilter={setSeverityFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        onExport={onExport}
      />
    </div>
  )
}

function BriefingPanel({
  report,
  phase,
  error,
  onGenerate,
}: {
  report: Report
  phase: BriefingPhase
  error: string | null
  onGenerate: () => void
}) {
  const briefing = report.briefing
  const effectivePhase = briefing ? 'ready' : phase

  return (
    <section className="briefing-panel panel-surface">
      <div className="panel-heading briefing-heading">
        <div>
          <p className="eyebrow eyebrow-lavender"><Icon name="spark" size={13} /> LOCAL AI BRIEFING</p>
          <h2>Make the next step smaller.</h2>
        </div>
        {report.briefingModel ? <span className="model-chip"><Icon name="model" size={13} />{report.briefingModel}</span> : null}
      </div>

      {effectivePhase === 'ready' && briefing ? <BriefingContent briefing={briefing} checks={report.checks} /> : null}
      {effectivePhase === 'loading' ? (
        <div className="briefing-loading" role="status">
          <div className="loading-line loading-line-wide" />
          <div className="loading-line" />
          <div className="loading-line loading-line-short" />
          <div className="loading-actions"><span /><span /><span /></div>
          <p>Asking the configured local model to explain only the recorded evidence…</p>
        </div>
      ) : null}
      {effectivePhase === 'idle' ? (
        <div className="briefing-idle">
          <span className="briefing-idle-mark"><Icon name="spark" size={18} /></span>
          <div>
            <h3>No briefing attached yet.</h3>
            <p>The scan is complete. Generate an optional local explanation when you want a concise maintenance sequence.</p>
          </div>
          <button className="button button-lavender" type="button" onClick={onGenerate}>
            <Icon name="spark" size={15} />
            Generate briefing
          </button>
        </div>
      ) : null}
      {effectivePhase === 'unavailable' || effectivePhase === 'error' ? (
        <div className={`briefing-result-message ${effectivePhase}`}>
          <span className="briefing-error-mark"><Icon name={effectivePhase === 'unavailable' ? 'clock' : 'warning'} size={17} /></span>
          <div>
            <h3>{effectivePhase === 'unavailable' ? 'Local model unavailable.' : 'Briefing could not be validated.'}</h3>
            <p>{error || 'The API returned no additional detail.'}</p>
          </div>
          <button className="button button-secondary" type="button" onClick={onGenerate}>
            <Icon name="refresh" size={15} />
            Retry
          </button>
        </div>
      ) : null}
    </section>
  )
}

function BriefingContent({ briefing, checks }: { briefing: Briefing; checks: Check[] }) {
  const checkNames = new Map(checks.map((check) => [check.id, check.name]))
  return (
    <div className="briefing-content">
      <div className="briefing-copy">
        <h3>{briefing.headline}</h3>
        <p>{briefing.summary}</p>
      </div>
      <div className="action-list">
        {briefing.actions.length ? briefing.actions.map((action) => (
          <div className="briefing-action" key={action.check_id}>
            <div className="action-index">{action.effort.slice(0, 1).toUpperCase()}</div>
            <div className="action-body">
              <div className="action-heading"><strong>{action.action}</strong><span>{action.effort} effort</span></div>
              <p>{action.why}</p>
              <span className="action-check"><Icon name="check" size={12} /> {checkNames.get(action.check_id) ?? action.check_id}</span>
            </div>
          </div>
        )) : <p className="briefing-no-actions">No additional action was recommended by the local model.</p>}
      </div>
    </div>
  )
}

function FindingsExplorer({
  report,
  filteredFindings,
  findingSearch,
  setFindingSearch,
  severityFilter,
  setSeverityFilter,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  onExport,
}: {
  report: Report
  filteredFindings: Check[]
  findingSearch: string
  setFindingSearch: (value: string) => void
  severityFilter: SeverityFilter
  setSeverityFilter: (value: SeverityFilter) => void
  statusFilter: StatusFilter
  setStatusFilter: (value: StatusFilter) => void
  sortBy: SortBy
  setSortBy: (value: SortBy) => void
  onExport: () => void
}) {
  return (
    <section className="findings-panel panel-surface">
      <div className="panel-heading findings-heading">
        <div>
          <p className="eyebrow">EVIDENCE EXPLORER</p>
          <h2>Findings</h2>
        </div>
        <div className="heading-actions">
          <span className="result-count"><strong>{filteredFindings.length}</strong> / {totalChecks(report)} checks</span>
          <button className="icon-button" type="button" onClick={onExport} aria-label="Export current report as JSON" title="Export JSON"><Icon name="download" size={16} /></button>
        </div>
      </div>
      <div className="filter-bar">
        <label className="search-field">
          <Icon name="search" size={16} />
          <span className="sr-only">Search findings</span>
          <input value={findingSearch} onChange={(event) => setFindingSearch(event.target.value)} placeholder="Search names, evidence, remediation…" />
        </label>
        <label className="select-field">
          <span>Signal</span>
          <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as SeverityFilter)}>
            <option value="ALL">Any signal</option>
            <option value="FAIL">FAIL</option>
            <option value="WARN">WARN</option>
            <option value="PASS">PASS</option>
          </select>
          <Icon name="chevron-down" size={14} />
        </label>
        <label className="select-field">
          <span>State</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="ALL">Any state</option>
            <option value="ACTIONABLE">Actionable</option>
            <option value="CLEAR">Clear</option>
            <option value="NOT_RUN">Not run</option>
            <option value="UNSUPPORTED">Unsupported</option>
          </select>
          <Icon name="chevron-down" size={14} />
        </label>
        <label className="select-field">
          <span>Sort</span>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}>
            <option value="priority">Priority</option>
            <option value="name">Name A–Z</option>
            <option value="status">Status</option>
            <option value="evidence">Evidence count</option>
          </select>
          <Icon name="chevron-down" size={14} />
        </label>
      </div>
      <div className="findings-list">
        {filteredFindings.length ? filteredFindings.map((check) => <FindingRow check={check} key={check.id} />) : (
          <div className="filter-empty">
            <div className="empty-mark small"><Icon name="search" size={18} /></div>
            <h3>No findings match those filters.</h3>
            <p>Clear the search or choose a broader signal/state combination.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function FindingRow({ check }: { check: Check }) {
  return (
    <article className={`finding-row finding-${check.status.toLowerCase()}`}>
      <div className="finding-topline">
        <div className="finding-title-wrap">
          <StatusBadge status={check.status} />
          <div>
            <h3>{check.name}</h3>
            <span className="finding-id mono-text">{check.id}</span>
          </div>
        </div>
        <span className="finding-evidence-count mono-text">{check.evidence.length} evidence item{check.evidence.length === 1 ? '' : 's'}</span>
      </div>
      <p className="finding-explanation">{check.explanation}</p>
      <div className="finding-details">
        <div className="detail-column">
          <span className="detail-label">Evidence</span>
          {check.evidence.length ? <ul className="evidence-list">{check.evidence.map((item, index) => <EvidenceItem item={item} evidenceId={`${check.id}-evidence-${index}`} key={`${item}-${index}`} />)}</ul> : <p className="detail-muted">No evidence captured.</p>}
        </div>
        <div className="detail-column remediation-column">
          <span className="detail-label">Smallest next step</span>
          <p className={check.remediation ? '' : 'detail-muted'}>{check.remediation || 'No remediation is required for this status.'}</p>
        </div>
      </div>
    </article>
  )
}

function EvidenceItem({ item, evidenceId }: { item: string; evidenceId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <li className={`evidence-entry ${expanded ? 'expanded' : ''}`}>
      <button className="evidence-expand" type="button" onClick={() => setExpanded((current) => !current)} title={expanded ? 'Collapse evidence' : 'Show full evidence'} aria-expanded={expanded} aria-controls={evidenceId}>
        <span className="evidence-bullet" aria-hidden="true" />
        <span className="evidence-value mono-text" id={evidenceId}>{item}</span>
        <span className="evidence-toggle">{expanded ? 'Less' : 'More'}</span>
      </button>
      <button className="evidence-copy" type="button" onClick={handleCopy} aria-label={`Copy evidence: ${item}`} title="Copy evidence">
        <Icon name={copied ? 'check' : 'copy'} size={12} />
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </li>
  )
}

function HistoryView({
  history,
  loading,
  error,
  openingId,
  confirmDeleteId,
  deleteBusyId,
  onRefresh,
  onOpen,
  onRequestDelete,
  onCancelDelete,
  onDelete,
}: {
  history: Report[]
  loading: boolean
  error: string | null
  openingId: string | null
  confirmDeleteId: string | null
  deleteBusyId: string | null
  onRefresh: () => void
  onOpen: (id: string) => void
  onRequestDelete: (id: string) => void
  onCancelDelete: () => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="view-stack">
      <div className="section-intro-row">
        <div>
          <p className="eyebrow">PERSISTED LOCALLY</p>
          <h2>History you can trust.</h2>
          <p>Every entry below came from the FastAPI history store. Open it to inspect the original checks and briefing.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={onRefresh} disabled={loading}>
          <Icon name="refresh" size={15} />
          {loading ? 'Refreshing…' : 'Refresh history'}
        </button>
      </div>
      {error ? <InlineNotice tone="error" icon="warning">{error}</InlineNotice> : null}
      {loading ? (
        <div className="history-list panel-surface" aria-label="Loading history">
          {[1, 2, 3].map((item) => <div className="history-skeleton" key={item}><span /><span /><span /></div>)}
        </div>
      ) : history.length ? (
        <div className="history-list panel-surface">
          {history.map((item) => {
            const isDeleting = deleteBusyId === item.id
            return (
              <article className="history-row" key={item.id}>
                <div className="history-main">
                  <div className={`history-scan-mark ${item.summary.FAIL > 0 ? 'has-fail' : item.summary.WARN > 0 ? 'has-warn' : 'all-clear'}`}><Icon name="scan" size={17} /></div>
                  <div className="history-copy">
                    <div className="history-title-line"><h3>{item.repositoryName}</h3><span className="history-status">{item.status}</span></div>
                    <p className="mono-text">{shortPath(item.repository)}</p>
                    <div className="history-meta"><span><Icon name="clock" size={13} /> {formatDate(item.createdAt)}</span><span>{formatDuration(item.durationMs)}</span><span>{item.summary.PASS ?? 0} pass · {item.summary.FAIL ?? 0} fail · {item.summary.WARN ?? 0} warn</span></div>
                  </div>
                </div>
                {confirmDeleteId === item.id ? (
                  <div className="delete-confirm" role="group" aria-label={`Confirm deleting ${item.repositoryName}`}>
                    <span>Delete this saved scan?</span>
                    <button className="button button-danger" type="button" disabled={isDeleting} onClick={() => onDelete(item.id)}>{isDeleting ? 'Deleting…' : 'Delete'}</button>
                    <button className="button button-quiet" type="button" disabled={isDeleting} onClick={onCancelDelete}>Cancel</button>
                  </div>
                ) : (
                  <div className="history-actions">
                    <button className="button button-secondary" type="button" onClick={() => onOpen(item.id)} disabled={openingId === item.id}>
                      {openingId === item.id ? <span className="button-spinner dark" /> : <Icon name="arrow-up-right" size={15} />}
                      {openingId === item.id ? 'Opening…' : 'Open report'}
                    </button>
                    <button className="icon-button danger-icon" type="button" onClick={() => onRequestDelete(item.id)} aria-label={`Delete ${item.repositoryName}`} title="Delete scan"><Icon name="trash" size={16} /></button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <section className="empty-panel panel-surface compact-empty">
          <div className="empty-mark small"><Icon name="history" size={20} /></div>
          <p className="eyebrow">NO SAVED SCANS</p>
          <h2>History will appear after the first scan.</h2>
          <p className="empty-copy">Run a deterministic scan from Overview. The API stores completed reports locally so you can return to them later.</p>
        </section>
      )}
    </div>
  )
}

function SettingsView({
  settings,
  draft,
  saving,
  message,
  error,
  connectionPhase,
  connectionResult,
  onChange,
  onSave,
  onTest,
}: {
  settings: Settings
  draft: { endpoint: string; model: string; timeout: number }
  saving: boolean
  message: string | null
  error: string | null
  connectionPhase: ConnectionPhase
  connectionResult: ConnectionTestResult | null
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onTest: () => void
}) {
  return (
    <div className="view-stack">
      <div className="section-intro-row">
        <div>
          <p className="eyebrow">LOCAL CONFIGURATION</p>
          <h2>Keep the model boundary explicit.</h2>
          <p>Only loopback OpenAI-compatible endpoints are accepted by the backend defaults. Scan evidence remains usable without AI.</p>
        </div>
      </div>
      {message ? <InlineNotice tone="success" icon="check">{message}</InlineNotice> : null}
      {error ? <InlineNotice tone="error" icon="warning">{error}</InlineNotice> : null}
      <div className="settings-grid">
        <section className="settings-panel panel-surface">
          <div className="panel-heading">
            <div><p className="eyebrow eyebrow-lavender"><Icon name="model" size={13} /> MODEL CONNECTION</p><h2>Briefing endpoint</h2></div>
            <span className={`settings-state-dot ${connectionPhase}`} />
          </div>
          <form className="settings-form" onSubmit={onSave}>
            <label className="field-label" htmlFor="endpoint">OpenAI-compatible endpoint</label>
            <input id="endpoint" name="endpoint" value={draft.endpoint} onChange={onChange} placeholder="http://127.0.0.1:11434/v1/chat/completions" spellCheck={false} />
            <p className="field-help">Ollama and other local OpenAI-compatible servers can expose this route.</p>

            <label className="field-label" htmlFor="model">Model name</label>
            <input id="model" name="model" value={draft.model} onChange={onChange} placeholder="qwen2.5:3b" spellCheck={false} />

            <label className="field-label" htmlFor="timeout">Request timeout <span className="field-unit">seconds</span></label>
            <input id="timeout" name="timeout" type="number" min="1" max="300" step="1" value={draft.timeout} onChange={onChange} />
            <div className="form-actions">
              <button className="button button-lavender" type="submit" disabled={saving}>
                {saving ? <span className="button-spinner" /> : <Icon name="check" size={15} />}
                {saving ? 'Saving…' : 'Save settings'}
              </button>
              <button className="button button-secondary" type="button" onClick={onTest} disabled={connectionPhase === 'testing'}>
                {connectionPhase === 'testing' ? <span className="button-spinner dark" /> : <Icon name="activity" size={15} />}
                {connectionPhase === 'testing' ? 'Testing…' : 'Test connection'}
              </button>
            </div>
          </form>
          <ConnectionResult phase={connectionPhase} result={connectionResult} />
        </section>

        <div className="settings-side-stack">
          <section className="settings-panel panel-surface">
            <div className="panel-heading"><div><p className="eyebrow">AUTHORIZED SCOPE</p><h2>Allowed roots</h2></div><Icon name="lock" size={17} /></div>
            <p className="settings-copy">The backend accepts repository paths only when they sit inside one of these local directories.</p>
            <div className="roots-list">
              {settings.allowedRoots.length ? settings.allowedRoots.map((root) => <div className="root-row" key={root}><Icon name="folder" size={15} /><span className="mono-text">{root}</span></div>) : <div className="settings-empty">No authorized roots were returned by the API.</div>}
            </div>
          </section>
          <section className="settings-panel panel-surface privacy-panel">
            <div className="panel-heading"><div><p className="eyebrow">PRIVACY CONTRACT</p><h2>Local by default.</h2></div><span className="privacy-badge"><Icon name="lock" size={13} /> LOCAL</span></div>
            <div className="privacy-list">
              <PrivacyRow label="Local-only endpoint" value={settings.privacy.localOnly} />
              <PrivacyRow label="Source files sent to model" value={settings.privacy.sourceFilesSent} inverted />
              <PrivacyRow label="Repository code executed" value={settings.privacy.repositoryCodeExecuted} inverted />
            </div>
            <p className="privacy-note">Sloth scans file metadata and selected text signals without executing repository code. The model receives structured results, not source files.</p>
          </section>
        </div>
      </div>
    </div>
  )
}

function ConnectionResult({ phase, result }: { phase: ConnectionPhase; result: ConnectionTestResult | null }) {
  if (phase === 'idle') return <p className="connection-placeholder">Save your endpoint, then test reachability and model availability.</p>
  if (phase === 'testing') return <div className="connection-result loading-result"><span className="button-spinner dark" /><span>Contacting the configured local model…</span></div>
  if (!result) return null
  const modelMissing = phase === 'model-missing'
  return (
    <div className={`connection-result ${modelMissing ? 'model-missing' : result.status}`}>
      <span className="connection-result-icon"><Icon name={result.status === 'connected' && !modelMissing ? 'check' : 'warning'} size={15} /></span>
      <div>
        <strong>{modelMissing ? 'Model not installed' : result.status === 'connected' ? 'Connection available' : 'Connection unavailable'}</strong>
        <p>{result.error || (modelMissing ? `${result.model} is not listed by the local model server.` : `${result.model} responded to the connection test.`)}</p>
        {result.models?.length ? <span className="model-list mono-text">Models: {result.models.join(', ')}</span> : null}
      </div>
    </div>
  )
}

function PrivacyRow({ label, value, inverted = false }: { label: string; value: boolean; inverted?: boolean }) {
  const isSafe = inverted ? !value : value
  return <div className="privacy-row"><span>{label}</span><span className={`privacy-value ${isSafe ? 'true' : 'false'}`}><Icon name={value ? 'check' : 'close'} size={12} />{value ? 'Yes' : 'No'}</span></div>
}

export default App
