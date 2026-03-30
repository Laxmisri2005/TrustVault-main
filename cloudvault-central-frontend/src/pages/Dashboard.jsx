import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { authHeader } from '../utils/auth'
import { getCloudConnectionStatus, normalizeSecretsPayload } from '../utils/cloudSecrets'

export default function Dashboard(){
  const [stats, setStats] = useState({
    total: 0,
    aws: 0,
    azure: 0,
    gcp: 0,
    lastRotation: 'N/A',
    awsStatus: 'unknown',
    azureStatus: 'unknown',
    gcpStatus: 'unknown'
  });
  const [loading, setLoading] = useState(true)

  function renderStatus(status) {
    return status === 'connected'
      ? <span className="text-green-600">Connected</span>
      : <span className="text-red-600">Error</span>
  }

  useEffect(()=>{
    async function load(){
      setLoading(true)
      try{
        const headers = authHeader()
        const [awsResult, azureResult, gcpResult, logsResult] = await Promise.allSettled([
          axios.get('/api/aws/secrets', { headers }),
          axios.get('/api/azure/secrets', { headers }),
          axios.get('/api/gcp/secrets', { headers }),
          axios.get('/api/logs', { headers })
        ])

        if (awsResult.status !== 'fulfilled') throw awsResult.reason

        const awsResponse = awsResult.value
        const azureResponse = azureResult.status === 'fulfilled' ? azureResult.value : null
        const gcpResponse = gcpResult.status === 'fulfilled' ? gcpResult.value : null
        const logs = logsResult.status === 'fulfilled' ? logsResult.value : { data: { logs: [] } }

        const awsSecrets = normalizeSecretsPayload(awsResponse.data)
        const azureSecrets = normalizeSecretsPayload(azureResponse?.data)
        const gcpSecrets = normalizeSecretsPayload(gcpResponse?.data)
        const rotation = (logs.data.logs || []).find((l)=>l.action === 'rotate_request')
        const last = rotation?.ts ? new Date(rotation.ts).toLocaleString() : 'N/A'
        setStats({
          total: awsSecrets.length + azureSecrets.length + gcpSecrets.length,
          aws: awsSecrets.length,
          azure: azureSecrets.length,
          gcp: gcpSecrets.length,
          lastRotation: last,
          awsStatus: getCloudConnectionStatus(awsResponse),
          azureStatus: azureResponse ? getCloudConnectionStatus(azureResponse) : 'error',
          gcpStatus: gcpResponse ? getCloudConnectionStatus(gcpResponse) : 'error'
        })
      }catch(e){
        console.error(e);
        setStats((s)=> ({ ...s, awsStatus: 'error', azureStatus: 'error', gcpStatus: 'error' }))
      }
      setLoading(false)
    }
    load();
  },[])

  return (
    <div className="content-panel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title">Dashboard</h2>
      </div>
      {loading ? <div>Loading dashboard...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="p-4 card-bg card-shadow">
            <div className="text-sm panel-muted">Total Secrets</div>
            <div className="text-3xl font-bold">{stats.total}</div>
          </div>
          <div className="p-4 card-bg card-shadow">
            <div className="text-sm panel-muted">AWS Secrets</div>
            <div className="text-3xl font-bold">{stats.aws}</div>
            <div className="text-xs panel-muted mt-2">Status: {renderStatus(stats.awsStatus)}</div>
          </div>
          <div className="p-4 card-bg card-shadow">
            <div className="text-sm panel-muted">Azure Secrets</div>
            <div className="text-3xl font-bold">{stats.azure}</div>
            <div className="text-xs panel-muted mt-2">Status: {renderStatus(stats.azureStatus)}</div>
          </div>
          <div className="p-4 card-bg card-shadow">
            <div className="text-sm panel-muted">GCP Secrets</div>
            <div className="text-3xl font-bold">{stats.gcp}</div>
            <div className="text-xs panel-muted mt-2">Status: {renderStatus(stats.gcpStatus)}</div>
          </div>
          <div className="p-4 card-bg card-shadow">
            <div className="text-sm panel-muted">Last Rotation</div>
            <div className="text-lg font-semibold">{stats.lastRotation}</div>
          </div>
        </div>
      )}
    </div>
  )
}
