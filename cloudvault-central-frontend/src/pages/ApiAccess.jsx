import React from 'react'

export default function ApiAccess(){
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">API Access</h2>
      <p>Sample endpoints:</p>
      <pre className="bg-slate-100 dark:bg-slate-950/40 dark:border dark:border-slate-700/40 text-slate-900 dark:text-slate-100 p-3 rounded text-sm overflow-auto">GET /api/aws/secret/:name
POST /api/aws/rotate/:name
GET /api/azure/secret/:name</pre>
      <p>Generate temporary API token (demo):</p>
      <button onClick={async ()=>{ const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'Developer'})}); const d=await r.json(); navigator.clipboard.writeText(d.token); alert('Token copied') }} className="px-3 py-1 bg-indigo-600 text-white rounded">Generate Demo Token</button>
    </div>
  )
}
