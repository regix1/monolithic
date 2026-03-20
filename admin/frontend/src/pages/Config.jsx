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
  Trash2,
  Hash,
} from 'lucide-react'
import Modal from '../components/Modal'
import { Card, Toggle } from '../components'
import Dropdown from '../components/Dropdown'
import TagSelect from '../components/TagSelect'
import { useSSE } from '../hooks/useSSE'
import { api } from '../lib/api'

function VarRow({ varDef, originalValue, onChange, tagOptions }) {
  const { key, value, default: defaultVal, description, type, options } = varDef
  const isEdited = value !== originalValue  // user changed it in this session
  const isCustomized = originalValue !== defaultVal  // differs from default (informational)

  return (
    <div
      className={[
        'grid grid-cols-1 gap-3 rounded-lg px-3 sm:px-5 py-3 sm:grid-cols-[280px_1fr_90px] items-center transition-colors',
        isEdited ? 'bg-warn/5 border border-warn/15' : 'bg-panda-bg',
      ].join(' ')}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-mono text-sm font-semibold text-bamboo truncate" title={key}>
          {key}
        </span>
        <span className="text-sm text-panda-muted leading-snug">{description}</span>
        {value !== defaultVal && (
          <span className="text-xs text-panda-dim font-mono mt-0.5">
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
            <span className="text-sm text-panda-muted font-mono">{value}</span>
          </div>
        ) : type === 'select' ? (
          <Dropdown
            options={(options ?? []).map((opt) => ({ value: opt, label: opt }))}
            value={value}
            onChange={(val) => onChange(key, val)}
          />
        ) : type === 'tags' ? (
          <TagSelect
            value={value}
            options={tagOptions ?? []}
            onChange={(val) => onChange(key, val)}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(key, e.target.value)}
            className="w-full rounded-lg border border-panda-border bg-panda-elevated px-4 py-2.5 text-sm text-panda-text focus:border-bamboo focus:outline-none transition-colors font-mono placeholder-panda-dim"
          />
        )}
      </div>

      <div className="flex items-center justify-start sm:justify-end">
        {isEdited ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-warn font-medium">
            <span className="w-2 h-2 rounded-full bg-warn inline-block" />
            unsaved
          </span>
        ) : isCustomized ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-panda-muted">
            <span className="w-2 h-2 rounded-full bg-panda-dim inline-block" />
            customized
          </span>
        ) : (
          <span className="text-sm text-panda-dim">default</span>
        )}
      </div>
    </div>
  )
}

function ConfigGroup({ group, originalValues, onChangeVar, tagOptions }) {
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
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-block h-5 w-1 rounded-full bg-bamboo shrink-0" />
            <span className="text-base font-semibold text-panda-text">{group.name}</span>
            {editedCount > 0 && (
              <span className="rounded-full bg-warn/10 border border-warn/25 text-warn text-sm px-3 py-0.5 font-medium">
                {editedCount} unsaved
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-panda-muted">
            <span className="text-sm">{group.vars.length} vars</span>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
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
                    tagOptions={v.type === 'tags' ? tagOptions : undefined}
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

function ConfigHashSection() {
  const [hashData, setHashData] = useState(null)
  const [hashLoading, setHashLoading] = useState(true)
  const [hashError, setHashError] = useState(null)
  const [deleteStatus, setDeleteStatus] = useState(null) // 'success' | 'error' | null
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  async function fetchHash() {
    setHashLoading(true)
    setHashError(null)
    try {
      const data = await api.getConfigHash()
      setHashData(data)
    } catch (err) {
      setHashError('Failed to load CONFIGHASH data')
    } finally {
      setHashLoading(false)
    }
  }

  useEffect(() => {
    fetchHash()
  }, [])

  async function performDeleteHash() {
    setShowDeleteModal(false)
    setDeleteStatus(null)
    try {
      await api.deleteConfigHash()
      setDeleteStatus('success')
      await fetchHash()
      setTimeout(() => setDeleteStatus(null), 3000)
    } catch (err) {
      setDeleteStatus('error')
    }
  }

  const componentRows = [
    { label: 'GENERICCACHE_VERSION', key: 'genericcache_version' },
    { label: 'CACHE_MODE', key: 'cache_mode' },
    { label: 'CACHE_SLICE_SIZE', key: 'cache_slice_size' },
    { label: 'CACHE_KEY', key: 'cache_key' },
  ]

  return (
    <>
      <Modal
        opened={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Config Hash"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg bg-red-500/10 px-4 py-3">
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 text-sm text-red-400">
              <p>This will delete the CONFIGHASH file.</p>
              <p>The container must be restarted after deletion to regenerate it.</p>
              <p>If your config has changed, existing cached data may be invalidated.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              className="rounded-lg border border-panda-border px-4 py-2 text-sm font-semibold text-panda-muted hover:text-panda-text hover:border-panda-elevated transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={performDeleteHash}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        </div>
      </Modal>

      <Card className="p-0 overflow-hidden">
        {/* Section header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-panda-border">
          <div className="flex items-center gap-3">
            <Hash size={16} className="text-bamboo shrink-0" />
            <div>
              <span className="text-base font-semibold text-panda-text">Config Hash</span>
              <p className="text-xs text-panda-dim mt-0.5">Guards against cache invalidation from config changes</p>
            </div>
          </div>

          {/* Status badge */}
          {!hashLoading && hashData && (
            hashData.exists ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-bamboo px-2.5 py-1 rounded-full bg-bamboo-glow border border-bamboo/25">
                <CheckCircle size={11} />
                Present
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warn px-2.5 py-1 rounded-full bg-warn/10 border border-warn/25">
                <AlertTriangle size={11} />
                Will regenerate on restart
              </span>
            )
          )}
        </div>

        <div className={['px-4 py-4 flex flex-col gap-4', hashLoading ? 'min-h-[200px]' : ''].join(' ')}>
          {hashLoading && (
            <p className="text-sm text-panda-dim">Loading…</p>
          )}

          {hashError && (
            <div className="flex items-center gap-2 text-sm text-err">
              <AlertTriangle size={14} className="shrink-0" />
              {hashError}
            </div>
          )}

          {!hashLoading && hashData && hashData.exists && (
            <>
              {/* Raw hash display */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-panda-muted uppercase tracking-wide">Raw Hash</span>
                <div className="flex items-center gap-2 rounded-lg border border-panda-border bg-panda-elevated px-4 py-2.5 font-mono text-sm text-panda-text break-all">
                  {hashData.raw}
                </div>
              </div>

              {/* Parsed components */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-panda-muted uppercase tracking-wide">Components</span>
                <div className="rounded-lg border border-panda-border overflow-x-auto">
                  {componentRows.map(({ label, key }, idx) => (
                    <div
                      key={key}
                      className={[
                        'grid grid-cols-[1fr_1fr] gap-4 px-4 py-2.5 text-sm',
                        idx > 0 ? 'border-t border-panda-border' : '',
                        'bg-panda-bg',
                      ].join(' ')}
                    >
                      <span className="font-mono text-panda-muted text-xs font-semibold self-center">{label}</span>
                      <span className="font-mono text-panda-text text-xs self-center break-all">
                        {hashData.components?.[key] ?? '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {!hashLoading && hashData && !hashData.exists && (
            <p className="text-sm text-panda-muted italic">No CONFIGHASH file found. It will be created on the next container start.</p>
          )}

          {/* Info text */}
          <p className="text-xs text-panda-dim leading-relaxed">
            This file is auto-generated on container startup from your environment variables.
            If it gets out of sync, delete it and restart the container to regenerate.
          </p>

          {/* Feedback banners */}
          {deleteStatus === 'success' && (
            <div className="flex items-center gap-2 text-sm text-bamboo rounded-lg border border-bamboo/25 bg-bamboo-glow px-3 py-2">
              <CheckCircle size={14} className="shrink-0" />
              CONFIGHASH deleted. Restart the container to regenerate.
            </div>
          )}
          {deleteStatus === 'error' && (
            <div className="flex items-center gap-2 text-sm text-err rounded-lg border border-err/30 bg-err/10 px-3 py-2">
              <AlertTriangle size={14} className="shrink-0" />
              Failed to delete CONFIGHASH — check browser console for details.
            </div>
          )}

          {/* Delete & Regenerate button */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={hashLoading || (hashData && !hashData.exists)}
              className="flex items-center gap-1.5 rounded-lg border border-err/40 bg-err/10 px-4 py-2 text-sm font-semibold text-err hover:bg-err/20 hover:border-err/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 size={13} />
              Delete &amp; Regenerate
            </button>
          </div>
        </div>
      </Card>
    </>
  )
}

export default function Config() {
  const { data: apiConfig } = useSSE('config', api.getConfig)
  const { data: apiFs } = useSSE('filesystem', api.getFilesystem, 60000)
  const { data: apiDomains } = useSSE('domains', api.getDomains, 60000)

  const serviceNames = useMemo(() => {
    if (!apiDomains) return []
    return Object.keys(apiDomains).sort()
  }, [apiDomains])

  const [groups, setGroups] = useState([])
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const initializedRef = useRef(false)

  // Track the original values as they came from the API (or mock)
  const [originalValues, setOriginalValues] = useState({})

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

  const fs = apiFs ?? { type: '', mount_point: '', device: '', sendfile_current: '', sendfile_recommended: '', mismatch: false, warning: '' }

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
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-panda-text">Configuration</h1>
          <p className="mt-1 text-base text-panda-dim">
            Environment Variables — changes require container restart
          </p>
        </div>

        <div className="flex items-center gap-2 sm:shrink-0 flex-wrap">
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
          tagOptions={serviceNames}
        />
      ))}

      {/* CONFIGHASH management */}
      <ConfigHashSection />
    </div>
  )
}
