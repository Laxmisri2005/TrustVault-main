import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Login(){
  const [user, setUser] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [role, setRole] = useState('');
  const [matchedUser, setMatchedUser] = useState('');
  const [users, setUsers] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [matchingKey, setMatchingKey] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const selectedUser = useMemo(
    () => users.find((u) => u.userName.toLowerCase() === (user || '').trim().toLowerCase()) || null,
    [users, user]
  );
  const roleOptions = selectedUser?.roleOptions || [];

  useEffect(() => {
    loadUsers(true);
    const id = setInterval(() => loadUsers(false), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedUser){
      setRole('');
      return;
    }
    if (!roleOptions.length){
      setRole('');
      return;
    }
    if (!role || !roleOptions.includes(role)){
      setRole(selectedUser.defaultRole || roleOptions[0]);
    }
  }, [selectedUser, roleOptions, role]);

  async function loadUsers(force){
    setSyncing(true);
    try{
      const res = await fetch(`/api/auth/iam/users${force ? '?refresh=1' : ''}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'failed to sync IAM users');
      setUsers(d.users || []);
      setSyncInfo(d.syncedAt ? `Synced: ${new Date(d.syncedAt).toLocaleString()}` : '');
    }catch(err){
      setError(err.message || 'sync error');
    }finally{
      setSyncing(false);
    }
  }

  async function matchAccessKey(force){
    const key = accessKeyId.trim();
    if (!key){
      setError('Enter an access key');
      return;
    }

    setError(null);
    setMatchingKey(true);
    try{
      const res = await fetch(`/api/auth/iam/access-key${force ? '?refresh=1' : ''}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessKeyId: key })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'failed to match access key');

      setUser(d.user || '');
      setMatchedUser(d.user || '');
      setRole(d.defaultRole || (d.roleOptions || [])[0] || '');
      setUsers((prev) => {
        if (!d.user) return prev;
        const nextUser = {
          userName: d.user,
          roleOptions: d.roleOptions || [],
          defaultRole: d.defaultRole || null,
          permissions: d.permissions || {}
        };
        const existing = prev.findIndex((item) => item.userName.toLowerCase() === d.user.toLowerCase());
        if (existing === -1) return [...prev, nextUser];
        const copy = [...prev];
        copy[existing] = { ...copy[existing], ...nextUser };
        return copy;
      });
      await loadUsers(force);
    }catch(err){
      setMatchedUser('');
      setError(err.message || 'access key match failed');
    }finally{
      setMatchingKey(false);
    }
  }

  async function submit(e){
    e.preventDefault();
    if (!user.trim()){
      setError('Select an IAM user');
      return;
    }
    if (!matchedUser || matchedUser.toLowerCase() !== user.trim().toLowerCase()){
      setError('Match a valid access key before signing in');
      return;
    }
    setError(null); setLoading(true);
    try{
      const res = await fetch('/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ role, user: user.trim() }) });
      const d = await res.json();
      if(d.token){
        localStorage.setItem('cv_token', d.token);
        sessionStorage.setItem('cv_session_auth', 'true');
        try{ const p = JSON.parse(atob(d.token.split('.')[1])); localStorage.setItem('cv_role', p.role); localStorage.setItem('cv_user', p.user);}catch(e){}
        navigate('/dashboard');
      }else{
        setError(d.error || 'login failed');
      }
    }catch(err){ setError(err.message || 'network error') }
    setLoading(false);
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white dark:bg-slate-950/40 rounded-xl card-shadow overflow-hidden border border-slate-100 dark:border-slate-700/40">
        <div className="topbar-gradient px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/25 border border-white/40 flex items-center justify-center text-white font-bold text-sm">
              TV
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-white">TrustVault Login</h2>
              <p className="text-sm text-white/90 mt-1">IAM Users and Policies Auto-Sync</p>
            </div>
          </div>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm panel-muted mb-1">AWS Access Key</label>
            <div className="flex items-center gap-2">
              <input
                value={accessKeyId}
                onChange={e=>{ setAccessKeyId(e.target.value); setMatchedUser(''); }}
                placeholder="Enter access key id"
                className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <button
                type="button"
                onClick={()=>matchAccessKey(true)}
                disabled={matchingKey || !accessKeyId.trim()}
                className="px-3 py-2 bg-slate-200 dark:bg-slate-800 dark:text-slate-100 rounded disabled:opacity-60 whitespace-nowrap"
              >
                {matchingKey ? 'Matching...' : 'Match'}
              </button>
            </div>
            <div className="mt-1 text-xs panel-muted">If the access key matches an AWS IAM user, the username and allowed roles will auto-fill.</div>
          </div>
          <div>
            <label className="block text-sm panel-muted mb-1">IAM User</label>
            <input
              list="iam-users"
              value={user}
              onChange={e=>{ setUser(e.target.value); setMatchedUser(''); }}
              placeholder={syncing ? 'Syncing users...' : 'Select IAM user'}
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <datalist id="iam-users">
              {users.map((u) => <option key={u.userName} value={u.userName} />)}
            </datalist>
            <div className="mt-1 text-xs panel-muted">{syncInfo || (syncing ? 'Syncing with AWS IAM...' : 'No sync info')}</div>
          </div>
          <div>
            <label className="block text-sm panel-muted mb-1">Role (from IAM policy)</label>
            <select
              value={role}
              onChange={e=>setRole(e.target.value)}
              disabled={!roleOptions.length}
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {!roleOptions.length && <option value="">No allowed roles</option>}
              {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex items-center justify-between pt-2">
            <button disabled={loading || !user.trim() || !role || !matchedUser || matchedUser.toLowerCase() !== user.trim().toLowerCase()} className="px-4 py-2 btn-primary rounded disabled:opacity-60">
              {loading? 'Signing in...' : 'Sign in'}
            </button>
            <div className="flex items-center gap-3">
              <button type="button" onClick={()=>{ setUser(''); setAccessKeyId(''); setRole(''); setMatchedUser(''); }} className="text-sm panel-muted">
                Reset
              </button>
              <button type="button" onClick={()=>loadUsers(true)} className="text-sm text-blue-700 dark:text-blue-300">
                Refresh IAM
              </button>
            </div>
          </div>
        </form>
      </div>
      <p className="text-center text-xs panel-muted mt-3">Changes in AWS IAM users/policies auto-refresh every 30s.</p>
    </div>
  )
}
