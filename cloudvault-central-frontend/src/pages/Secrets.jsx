import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { getRole, authHeader } from '../utils/auth'
import { normalizeSecretsPayload } from '../utils/cloudSecrets'

function Card({ children }) {
  return <div className="p-4 card-bg rounded shadow">{children}</div>
}

function getSecretOwner(secret) {
  const labels = secret?.labels || {}
  const tags = Array.isArray(secret?.tags) ? secret.tags : []
  const ownerFromLabels = labels.owner || labels.username || labels.user || labels.createdby || labels.created_by
  const ownerFromTags = tags.find((tag) =>
    ['owner', 'username', 'user', 'createdby', 'created_by'].includes(String(tag?.Key || '').toLowerCase())
  )?.Value
  if (!ownerFromLabels && !ownerFromTags && secret?.name === 'demo-secret') return 'vardhini'
  return String(ownerFromLabels || ownerFromTags || '').trim()
}

function providerDisplayName(provider, name, secret, showOwner = false) {
  const owner = getSecretOwner(secret)
  const ownerLabel = showOwner ? ` (${owner || 'unknown'})` : ''
  if (provider === 'gcp' && name === 'demo-secret') {
    return `GCP - demo-secret2${ownerLabel}`
  }
  return `${provider.toUpperCase()} - ${name}${ownerLabel}`
}

export default function Secrets() {
  const [aws, setAws] = useState([])
  const [azure, setAzure] = useState([])
  const [gcp, setGcp] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState({ open: false, title: '', value: '' })
  const [createModal, setCreateModal] = useState({ open: false, provider: 'gcp', name: '', value: '', saving: false })
  const role = getRole()

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const headers = authHeader()
      const request = (path) =>
        axios
          .get(path, { headers })
          .then((resp) => normalizeSecretsPayload(resp.data))
          .catch(() => [])

      const [nextAws, nextAzure, nextGcp] = await Promise.all([
        request('/api/aws/secrets'),
        request('/api/azure/secrets'),
        request('/api/gcp/secrets')
      ])

      setAws(nextAws)
      setAzure(nextAzure)
      setGcp(nextGcp)
    } catch (e) {
      console.error(e)
      setAws([])
      setAzure([])
      setGcp([])
    } finally {
      setLoading(false)
    }
  }

  async function viewSecret(provider, name) {
    try {
      const resp = await axios.get(`/api/${provider}/secret/${encodeURIComponent(name)}`, { headers: authHeader() })
      const secretsByProvider = { aws, azure, gcp }
      const matchedSecret = (secretsByProvider[provider] || []).find((item) => item.name === name)
      setModal({ open: true, title: providerDisplayName(provider, name, matchedSecret, role === 'Admin'), value: resp.data.value || '' })
    } catch (e) {
      alert('Failed to fetch secret: ' + (e?.response?.data?.error || e.message))
    }
  }

  async function rotateSecret(provider, name) {
    try {
      const resp = await axios.post(`/api/${provider}/rotate/${encodeURIComponent(name)}`, {}, { headers: authHeader() })
      alert(resp.data.message || 'Rotation requested')
      load()
    } catch (e) {
      alert('Rotate failed: ' + (e?.response?.data?.error || e.message))
    }
  }

  function deleteSecret(provider, name) {
    alert(`Delete is not implemented yet for ${providerDisplayName(provider, name)}.`)
  }

  function openCreateSecret(provider) {
    setCreateModal({ open: true, provider, name: '', value: '', saving: false })
  }

  function closeCreateModal() {
    setCreateModal({ open: false, provider: 'gcp', name: '', value: '', saving: false })
  }

  async function submitCreateSecret() {
    const provider = createModal.provider
    const name = createModal.name.trim()
    const value = createModal.value

    if (!name || !value) {
      alert('Secret name and value are required.')
      return
    }

    try {
      setCreateModal((prev) => ({ ...prev, saving: true }))
      const resp = await axios.post(
        `/api/${provider}/secrets`,
        { name, value },
        { headers: authHeader() }
      )
      alert(resp.data.message || 'Secret created')
      closeCreateModal()
      load()
    } catch (e) {
      alert('Create failed: ' + (e?.response?.data?.error || e.message))
      setCreateModal((prev) => ({ ...prev, saving: false }))
    }
  }

  function renderSecretRow(provider, secret, timestampLabel, timestampValue) {
    return (
      <div key={secret.name} className="flex items-center justify-between p-3 border rounded">
        <div>
          <div className="font-medium">{providerDisplayName(provider, secret.name, secret, role === 'Admin')}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">{timestampLabel}: {timestampValue || '-'}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            title="Request rotation of this secret"
            onClick={() => rotateSecret(provider, secret.name)}
            className="px-3 py-1 bg-yellow-500 text-white rounded"
          >
            Rotate
          </button>
          <button
            title="Delete secret (not implemented)"
            onClick={() => deleteSecret(provider, secret.name)}
            className="px-3 py-1 bg-red-600 text-white rounded"
          >
            Delete
          </button>
          <button
            title={role === 'Admin' ? 'Reveal full secret value' : 'Reveal secret value (masked for non-Admins)'}
            onClick={() => viewSecret(provider, secret.name)}
            className="px-3 py-1 bg-gray-700 text-white rounded"
          >
            Reveal
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="content-panel">
      <h2 className="section-title mb-4">Secrets Management</h2>
      {loading && <div className="mb-4 text-sm panel-muted">Syncing...</div>}
      <div className="grid gap-6">
        <Card>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="section-title text-lg font-medium">AWS Secrets</h3>
            <button
              type="button"
              onClick={() => openCreateSecret('aws')}
              className="px-3 py-1 bg-blue-600 text-white rounded"
            >
              Create
            </button>
          </div>
          <div className="space-y-3">
            {aws.map((s) => renderSecretRow('aws', s, 'Last changed', s.lastChanged))}
            {!loading && !aws.length && <div className="text-sm panel-muted">No AWS secrets found.</div>}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="section-title text-lg font-medium">Azure Secrets</h3>
            <button
              type="button"
              onClick={() => alert('Create is not implemented yet for AZURE.')}
              className="px-3 py-1 bg-blue-600 text-white rounded"
            >
              Create
            </button>
          </div>
          <div className="space-y-3">
            {azure.map((s) => renderSecretRow('azure', s, 'Updated', s.updatedOn))}
            {!loading && !azure.length && <div className="text-sm panel-muted">No Azure secrets found.</div>}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="section-title text-lg font-medium">GCP Secrets</h3>
            <button
              type="button"
              onClick={() => openCreateSecret('gcp')}
              className="px-3 py-1 bg-blue-600 text-white rounded"
            >
              Create
            </button>
          </div>
          <div className="space-y-3">
            {gcp.map((s) => renderSecretRow('gcp', s, 'Created', s.createdOn))}
            {!loading && !gcp.length && <div className="text-sm panel-muted">No GCP secrets found.</div>}
          </div>
        </Card>
      </div>

      {modal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-950/50 dark:border dark:border-slate-700/40 p-6 rounded w-11/12 md:w-1/2">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-semibold">{modal.title}</h3>
              <button
                onClick={() => setModal({ open: false, title: '', value: '' })}
                className="text-gray-500 dark:text-gray-300"
                aria-label="Close"
              >
                x
              </button>
            </div>
            <pre className="mt-4 bg-slate-100 dark:bg-slate-950/60 text-slate-900 dark:text-slate-100 p-4 rounded text-sm overflow-auto">
              {modal.value}
            </pre>
            <div className="mt-4 text-right">
              <button
                onClick={() => setModal({ open: false, title: '', value: '' })}
                className="px-3 py-1 bg-gray-200 dark:bg-slate-800 dark:text-slate-100 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {createModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-950/50 dark:border dark:border-slate-700/40 p-6 rounded w-11/12 md:w-1/2">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-semibold">Create {createModal.provider.toUpperCase()} Secret</h3>
              <button
                onClick={closeCreateModal}
                className="text-gray-500 dark:text-gray-300"
                aria-label="Close"
              >
                x
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Secret Name</label>
                <input
                  type="text"
                  value={createModal.name}
                  onChange={(e) => setCreateModal((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded border px-3 py-2 bg-white dark:bg-slate-900 dark:text-slate-100"
                  placeholder="demo-secret3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Secret Value</label>
                <textarea
                  value={createModal.value}
                  onChange={(e) => setCreateModal((prev) => ({ ...prev, value: e.target.value }))}
                  className="w-full rounded border px-3 py-2 min-h-32 bg-white dark:bg-slate-900 dark:text-slate-100"
                  placeholder="Enter the secret value"
                />
              </div>
            </div>

            <div className="mt-4 text-right flex justify-end gap-2">
              <button
                onClick={closeCreateModal}
                className="px-3 py-1 bg-gray-200 dark:bg-slate-800 dark:text-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={submitCreateSecret}
                disabled={createModal.saving}
                className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-60"
              >
                {createModal.saving ? 'Creating...' : 'Create Secret'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
