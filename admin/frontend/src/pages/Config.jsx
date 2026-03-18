import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Save,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Zap,
} from 'lucide-react'
import { Card, Toggle } from '../components'
import Dropdown from '../components/Dropdown'
import { mockConfig, mockFilesystem } from '../lib/mockData'
import { usePolling } from '../hooks/usePolling'
import { api } from '../lib/api'

function VarRow({ varDef, originalValue, onChange }) {
  const { key, value, default: defaultVal, description, type, options } = varDef
  const isEdited = value !== originalValue  // user changed it in this session
  const isCustomized = originalValue !== defaultVal  // differs from default (informational)

  return (
    <div
      className={[
        'grid grid-cols-1 gap-2 rounded-lg px-4 py-2.5 sm:grid-cols-[1fr_1.2fr_auto] transition-colors',
        isEdited ? 'bg-warn/5 border border-warn/15' : 'bg-panda-bg',
      ].join(' ')}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-mono text-sm font-semibold text-bamboo truncate" title={key}>
          {key}
        </span>
        <span className="text-xs text-panda-muted leading-snug">{description}</span>
        {value !== defaultVal && (
          <span className="text-[10px] text-panda-dim font-mono mt-0.5">
            default: <span className="text-panda-muted">{defaultVal === '' ? '(empty)' : defaultVal}</span>
          </span>
        )}
      </div>

      <div className="flex items-center">
        {type === 'bool' ? (
          <div className="flex items-center gap-2">
            <Toggle
              checked={value === 'true'}
              onChange={(checked) => onChange(key, checked ? 'true' : 'false')}
            />
            <span className="text-xs text-panda-muted font-mono">{value}</span>
          </div>
        ) : type === 'select' ? (
          <Dropdown
            options={(options ?? []).map((opt) => ({ value: opt, label: opt }))}
            value={value}
            onChange={(val) => onChange(key, val)}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(key, e.target.value)}
            className="w-full rounded-md border border-panda-border bg-panda-elevated px-3 py-1.5 text-sm text-panda-text focus:border-bamboo focus:outline-none transition-colors font-mono placeholder-panda-dim"
          />
        )}
      </div>

      <div className="flex items-center justify-end">
        {isEdited ? (
          <span className="inline-flex items-center gap-1 text-xs text-warn font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-warn inline-block" />
            unsaved
          </span>
        ) : isCustomized ? (
          <span className="inline-flex items-center gap-1 text-xs text-panda-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-panda-dim inline-block" />
            customized
          </span>
        ) : (
          <span className="text-xs text-panda-dim">default</span>
        )}
      </div>
    </div>
  )
}

function ConfigGroup({ group, originalValues, onChangeVar }) {
  const [open, setOpen] = useState(true)
  const editedCount = group.vars.filter((v) => v.value !== (originalValues[v.key] ?? v.default)).length

  return (
    <div>
      <Card className="p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-panda-elevated/40 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-4 w-1 rounded-full bg-bamboo shrink-0" />
            <span className="text-sm font-semibold text-panda-text">{group.name}</span>
            {editedCount > 0 && (
              <span className="rounded-full bg-warn/10 border border-warn/25 text-warn text-xs px-2 py-0.5 font-medium">
                {editedCount} unsaved
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-panda-muted">
            <span className="text-xs">{group.vars.length} vars</span>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div className="border-t border-panda-border px-4 py-3 flex flex-col gap-2">
                {group.vars.map((v) => (
                  <VarRow
                    key={v.key}
                    varDef={v}
                    originalValue={originalValues[v.key] ?? v.default}
                    onChange={onChangeVar}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  )
}

export default function Config() {
  const { data: apiConfig } = usePolling(api.getConfig, 30000)
  const { data: apiFs } = usePolling(api.getFilesystem, 30000)

  const [groups, setGroups] = useState(mockConfig.groups)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const initializedRef = useRef(false)

  // Track the original values as they came from the API (or mock)
  const [originalValues, setOriginalValues] = useState(() => {
    const vals = {}
    mockConfig.groups.forEach(g => g.vars.forEach(v => { vals[v.key] = v.value }))
    return vals
  })

  // When real API data arrives for the first time, use it
  useEffect(() => {
    if (apiConfig?.groups && !initializedRef.current) {
      setGroups(apiConfig.groups)
      const vals = {}
      apiConfig.groups.forEach(g => g.vars.forEach(v => { vals[v.key] = v.value }))
      setOriginalValues(vals)
      initializedRef.current = true
    }
  }, [apiConfig])

  const fs = apiFs ?? mockFilesystem

  // Count vars the user has actually edited (different from what came from the server)
  const dirtyCount = useMemo(() => {
    return groups.reduce(
      (acc, g) => acc + g.vars.filter((v) => v.value !== (originalValues[v.key] ?? v.default)).length,
      0
    )
  }, [groups, originalValues])

  const currentSendfile = groups
    .flatMap((g) => g.vars)
    .find((v) => v.key === 'NGINX_SENDFILE')?.value

  const showFsMismatch = fs.mismatch && currentSendfile !== fs.sendfile_recommended

  function handleChangeVar(key, val) {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        vars: g.vars.map((v) => (v.key === key ? { ...v, value: val } : v)),
      }))
    )
    setSaved(false)
  }

  function handleFixNow() {
    handleChangeVar('NGINX_SENDFILE', fs.sendfile_recommended)
  }

  function handleReset() {
    // Reset to original server values, not defaults
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        vars: g.vars.map((v) => ({ ...v, value: originalValues[v.key] ?? v.default })),
      }))
    )
    setSaved(false)
  }

  async function handleSave() {
    setSaveError(null)
    const vars = {}
    groups.forEach(g => g.vars.forEach(v => { vars[v.key] = v.value }))
    const result = await api.updateConfig(vars)
    if (result === null) {
      setSaveError('Failed to save — check browser console (F12) for details')
      return
    }

    // Re-fetch BEFORE nginx reload so the proxy is still stable
    const freshConfig = await api.getConfig()
    if (freshConfig?.groups) {
      setGroups(freshConfig.groups)
      const vals = {}
      freshConfig.groups.forEach(g => g.vars.forEach(v => { vals[v.key] = v.value }))
      setOriginalValues(vals)
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)

    // Reload nginx in the background — don't block UI or disrupt the proxy mid-fetch
    api.reloadNginx()
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-panda-text">Configuration</h1>
          <p className="mt-0.5 text-sm text-panda-dim">
            Environment Variables — changes require container restart
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {dirtyCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-warn px-2.5 py-1 rounded-full bg-warn/10 border border-warn/25">
              <AlertTriangle size={12} />
              {dirtyCount} unsaved
            </span>
          )}
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-bamboo px-2.5 py-1 rounded-full bg-bamboo-glow border border-bamboo/25">
              <CheckCircle size={12} />
              Saved
            </span>
          )}
          <button
            onClick={handleReset}
            disabled={dirtyCount === 0}
            className="flex items-center gap-1.5 rounded-lg border border-panda-border px-3 py-2 text-sm text-panda-muted hover:text-panda-text hover:border-panda-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={13} />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={dirtyCount === 0}
            className="flex items-center gap-1.5 rounded-lg bg-bamboo px-3 py-2 text-sm font-semibold text-panda-bg hover:bg-bamboo-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={13} />
            Save &amp; Restart
          </button>
        </div>
      </div>

      {/* Save error banner */}
      {saveError && (
        <div className="rounded-xl border border-err/30 bg-err/10 px-4 py-3 flex items-center gap-2.5">
          <AlertTriangle size={15} className="text-err shrink-0" />
          <p className="text-sm font-semibold text-err">{saveError}</p>
        </div>
      )}

      {/* Filesystem mismatch banner */}
      {showFsMismatch && (
        <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-warn mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-warn">
                Filesystem Mismatch: {fs.type} on {fs.mount_point}
              </p>
              <p className="text-xs text-warn/80 mt-0.5">
                Set <span className="font-mono">NGINX_SENDFILE={fs.sendfile_recommended}</span> to prevent I/O errors.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleFixNow}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-warn px-4 py-2 text-sm font-semibold text-panda-bg hover:bg-amber-400 transition-colors"
          >
            <Zap size={13} />
            Fix Now
          </button>
        </div>
      )}

      {/* Unsaved changes banner */}
      {dirtyCount > 0 && !saved && (
        <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={14} className="text-warn shrink-0" />
            <p className="text-sm font-semibold text-warn">
              {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'} — restart required to apply
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-bamboo px-4 py-2 text-sm font-semibold text-panda-bg hover:bg-bamboo-hover transition-colors"
          >
            <Save size={13} />
            Save &amp; Restart
          </button>
        </div>
      )}

      {/* Config groups */}
      {groups.map((group) => (
        <ConfigGroup
          key={group.name}
          group={group}
          originalValues={originalValues}
          onChangeVar={handleChangeVar}
        />
      ))}
    </div>
  )
}
