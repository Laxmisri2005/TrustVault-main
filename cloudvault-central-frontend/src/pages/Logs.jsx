import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { authHeader } from '../utils/auth'

export default function Logs(){
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const visibleLogs = logs.filter((l) => !['invalid_token', 'unauthorized_missing_token'].includes(l.action))

  useEffect(()=>{ fetchLogs() },[])
  async function fetchLogs(){
    setLoading(true)
    try{
      const r = await axios.get('/api/logs', { headers: authHeader() });
      setLogs(r.data.logs || [])
    }catch(e){ console.error(e); setLogs([]) }
    setLoading(false)
  }

  return (
    <div className="content-panel">
      <h2 className="section-title mb-4">Audit Logs</h2>
      <div className="card-bg rounded shadow p-4">
        {loading ? <div>Loading logs...</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="p-2">Time</th>
                <th className="p-2">User</th>
                <th className="p-2">Action</th>
                <th className="p-2">Secret</th>
                <th className="p-2">Provider</th>
                <th className="p-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {visibleLogs.map((l,i)=> (
                <tr key={i} className="border-t">
                  <td className="p-2">{l.ts || l.when}</td>
                  <td className="p-2">{l.user}</td>
                  <td className="p-2">{l.action}</td>
                  <td className="p-2">{l.secret || '-'}</td>
                  <td className="p-2">{l.provider || '-'}</td>
                  <td className="p-2">
                    {l.notificationStatus
                      ? `${l.notificationStatus}${l.notificationSent ? ' (sent)' : ''}`
                      : (l.reason || '-')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
