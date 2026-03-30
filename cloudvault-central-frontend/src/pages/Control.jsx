import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { authHeader } from '../utils/auth'
import { getCloudConnectionStatus } from '../utils/cloudSecrets'

export default function Control(){
  const [status, setStatus] = useState({ aws: 'unknown', azure: 'unknown', gcp: 'unknown' });
  useEffect(()=>{ load() },[])
  async function load(){
    try{
      const a = await axios.get('/api/aws/secrets', { headers: authHeader() }).catch(()=>null);
      const b = await axios.get('/api/azure/secrets', { headers: authHeader() }).catch(()=>null);
      const c = await axios.get('/api/gcp/secrets', { headers: authHeader() }).catch(()=>null);
      setStatus({
        aws: getCloudConnectionStatus(a),
        azure: getCloudConnectionStatus(b),
        gcp: getCloudConnectionStatus(c)
      });
    }catch(e){console.error(e)}
  }
  return (
    <div className="content-panel">
      <h2 className="section-title mb-4">Multi-Cloud Control</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 card-bg rounded shadow flex items-center justify-between">
          <div className="panel-muted">AWS Connection</div>
          <div>{status.aws === 'connected' ? <span className="text-green-600 font-semibold">Connected</span> : <span className="text-red-600 font-semibold">Error</span>}</div>
        </div>
        <div className="p-4 card-bg rounded shadow flex items-center justify-between">
          <div className="panel-muted">Azure Connection</div>
          <div>{status.azure === 'connected' ? <span className="text-green-600 font-semibold">Connected</span> : <span className="text-red-600 font-semibold">Error</span>}</div>
        </div>
        <div className="p-4 card-bg rounded shadow flex items-center justify-between">
          <div className="panel-muted">GCP Connection</div>
          <div>{status.gcp === 'connected' ? <span className="text-green-600 font-semibold">Connected</span> : <span className="text-red-600 font-semibold">Error</span>}</div>
        </div>
      </div>
    </div>
  )
}
