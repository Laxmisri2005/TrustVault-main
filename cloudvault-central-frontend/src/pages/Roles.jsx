import React, { useEffect, useState } from 'react'
import { getStoredUser } from '../utils/auth'

export default function Roles(){
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [syncInfo, setSyncInfo] = useState('');
  const [switching, setSwitching] = useState('');
  const currentUser = getStoredUser();

  useEffect(() => {
    loadUsers(true);
    const id = setInterval(() => loadUsers(false), 30000);
    return () => clearInterval(id);
  }, []);

  async function loadUsers(force){
    setLoading(true);
    setError('');
    try{
      const res = await fetch(`/api/auth/iam/users${force ? '?refresh=1' : ''}`);
      const d = await res.json();
      if(!res.ok) throw new Error(d.error || 'failed to sync users');
      setUsers(d.users || []);
      setSyncInfo(d.syncedAt ? `Synced: ${new Date(d.syncedAt).toLocaleString()}` : '');
    }catch(err){
      setError(err.message || 'sync error');
    }finally{
      setLoading(false);
    }
  }

  async function switchRole(userName, role){
    setSwitching(`${userName}:${role}`);
    try{
      const res = await fetch('/api/auth/login', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({ user: userName, role })
      });
      const d = await res.json();
      if(!res.ok || !d.token) throw new Error(d.error || 'role switch failed');
      localStorage.setItem('cv_token', d.token);
      sessionStorage.setItem('cv_session_auth', 'true');
      try{
        const p = JSON.parse(atob(d.token.split('.')[1]));
        localStorage.setItem('cv_role', p.role || role);
        localStorage.setItem('cv_user', p.user || userName);
      }catch(_){}
      alert(`Switched to ${role} for ${userName}`);
      setTimeout(() => location.reload(), 100);
    }catch(err){
      alert(`Switch failed: ${err.message || err}`);
    }finally{
      setSwitching('');
    }
  }

  return (
    <div className="content-panel">
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title">Role Access (AWS IAM Synced)</h2>
        <button onClick={() => loadUsers(true)} className="px-3 py-1 bg-indigo-600 text-white rounded">
          {loading ? 'Syncing...' : 'Refresh IAM'}
        </button>
      </div>
      <p className="panel-muted">Users, roles, and permissions are derived from AWS IAM policies and refreshed every 30 seconds.</p>
      {syncInfo && <p className="text-xs panel-muted mt-1">{syncInfo}</p>}
      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

      <div className="mt-4 overflow-auto">
        <table className="w-full bg-white dark:bg-slate-950/40 dark:border dark:border-slate-700/40 rounded shadow text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200 dark:border-slate-700/40">
              <th className="p-3">IAM User</th>
              <th className="p-3">Roles</th>
              <th className="p-3">Permissions</th>
              <th className="p-3">Policies</th>
              <th className="p-3">Switch</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userName} className="border-b border-slate-200 dark:border-slate-700/40 align-top">
                <td className="p-3">
                  <div className="font-medium">{u.userName}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{u.arn}</div>
                  {currentUser === u.userName && <div className="text-xs text-green-700 dark:text-green-300 mt-1">Current login</div>}
                </td>
                <td className="p-3">{(u.roleOptions || []).join(', ') || 'No app role'}</td>
                <td className="p-3">
                  <div>View: {u.permissions?.canView ? 'Yes' : 'No'}</div>
                  <div>Rotate: {u.permissions?.canRotate ? 'Yes' : 'No'}</div>
                  <div>Delete: {u.permissions?.canDelete ? 'Yes' : 'No'}</div>
                </td>
                <td className="p-3">
                  <div className="max-h-24 overflow-auto">
                    {(u.policyNames || []).length ? (u.policyNames || []).map((p) => (
                      <div key={p} className="text-xs text-gray-600 dark:text-gray-300">{p}</div>
                    )) : <span className="text-xs text-gray-500 dark:text-gray-400">No policies</span>}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    {(u.roleOptions || []).map((r) => (
                      <button
                        key={`${u.userName}-${r}`}
                        onClick={() => switchRole(u.userName, r)}
                        disabled={!!switching}
                        className="px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-60"
                      >
                        {switching === `${u.userName}:${r}` ? 'Switching...' : `Use ${r}`}
                      </button>
                    ))}
                    {!u.roleOptions?.length && <span className="text-xs text-gray-500 dark:text-gray-400">No switch options</span>}
                  </div>
                </td>
              </tr>
            ))}
            {!users.length && !loading && (
              <tr>
                <td className="p-3 text-gray-500 dark:text-gray-400" colSpan={5}>No IAM users returned.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
