import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { authHeader } from '../utils/auth'

export default function Rotation() {
  const [selection, setSelection] = useState('all')
  const [secrets, setSecrets] = useState([])
  const [loadingSecrets, setLoadingSecrets] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadSecrets()
  }, [])

  async function loadSecrets() {
    setLoadingSecrets(true)
    try {
      const headers = authHeader()
      const resp = await axios.get('/api/rotation/options', { headers })
      const list = Array.isArray(resp?.data?.secrets) ? resp.data.secrets : []
      setSecrets(list)
      if (selection !== 'all' && list.length && !list.some((item) => item.label === selection)) {
        setSelection('all')
      }
    } catch (e) {
      console.error('Failed to load secrets', e)
      setSecrets([])
    } finally {
      setLoadingSecrets(false)
    }
  }

  async function triggerRotation() {
    const selectedSecrets = selection === 'all'
      ? secrets
      : secrets.filter((item) => item.label === selection)

    if (!selectedSecrets.length) {
      alert('Select a secret')
      return
    }

    setLoading(true)
    setMessage('')
    try {
      const headers = authHeader()
      const responses = []
      for (const item of selectedSecrets) {
        try {
          const resp = await axios.post(`/api/${item.provider}/rotate/${encodeURIComponent(item.name)}`, {}, { headers })
          responses.push(resp?.data?.message || `Rotation requested for ${item.label}`)
        } catch (err) {
          const detail = err?.response?.data?.details || err?.response?.data?.error || err.message
          responses.push(`Access denied for ${item.label}: ${detail}`)
        }
      }
      const msg = responses.join(' | ')
      setMessage(msg)
      if (localStorage.getItem('cv_alerts') !== 'false') alert(msg)
    } catch (e) {
      const err = e?.response?.data?.details || e?.response?.data?.error || e.message
      setMessage(`Rotation failed: ${err}`)
      if (localStorage.getItem('cv_alerts') !== 'false') alert(`Rotate failed: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const selectedLabel = selection === 'all' ? 'All' : selection

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Secret Rotation</h2>
      <p>This page triggers manual rotation and shows scheduled rotation status.</p>
      <div className="mt-4 bg-white dark:bg-slate-950/40 dark:border dark:border-slate-700/40 rounded p-4 shadow">
        <div>Next scheduled rotation: <strong>Not configured (demo)</strong></div>
        <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          Secret names are visible here for the access-control demo. Rotation requests are still validated by the backend.
        </div>
        <div className="mt-4 flex flex-col md:flex-row md:items-center gap-3">
          <select
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
            className="border rounded px-3 py-2 w-full md:w-80 bg-white dark:bg-slate-950/30 dark:border-slate-700/40"
            disabled={loadingSecrets}
          >
            <option value="all">All</option>
            {secrets.map((item) => (
              <option key={`${item.provider}:${item.name}`} value={item.label}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadSecrets}
            disabled={loadingSecrets}
            className="px-3 py-2 bg-gray-200 dark:bg-slate-800 dark:text-slate-100 rounded disabled:opacity-60"
          >
            {loadingSecrets ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="mt-4">
          <input
            value={selectedLabel}
            readOnly
            placeholder="Secret name"
            className="border rounded px-3 py-2 w-full md:w-80 bg-slate-50 dark:bg-slate-950/30 dark:border-slate-700/40"
          />
        </div>
        <div className="mt-4">
          <button
            onClick={triggerRotation}
            disabled={loading || loadingSecrets || !secrets.length}
            className="px-3 py-2 bg-yellow-500 text-slate-900 rounded disabled:opacity-60"
          >
            {loading ? 'Triggering...' : 'Trigger Rotation'}
          </button>
        </div>
        {message && <div className="mt-3 text-sm text-gray-700 dark:text-gray-300">{message}</div>}
      </div>
    </div>
  )
}
