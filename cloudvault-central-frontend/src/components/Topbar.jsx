import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRole, parseJwt, getStoredToken, getStoredAvatar, getGravatarEmail, gravatarUrl, authHeader } from '../utils/auth'

export default function Topbar({dark, setDark}){
  const [alertCount, setAlertCount] = useState(0);
  const [latestAlert, setLatestAlert] = useState(null);
  const role = getRole() || 'Unauthenticated'
  const token = getStoredToken();
  const payload = parseJwt(token) || {};
  const user = payload.user || localStorage.getItem('cv_user') || 'demo-user';
  const storedAvatar = getStoredAvatar();
  const gravEmail = getGravatarEmail();
  const avatar = storedAvatar || (gravEmail ? gravatarUrl(gravEmail,64) : null);

  function logout(){
    localStorage.removeItem('cv_token');
    localStorage.removeItem('cv_role');
    localStorage.removeItem('cv_user');
    sessionStorage.removeItem('cv_session_auth');
    window.location.reload();
  }

  useEffect(() => {
    let mounted = true;
    let since = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    async function pollAlerts(){
      try{
        const qs = encodeURIComponent(since);
        const res = await fetch(`/api/alerts?since=${qs}&limit=20`, { headers: authHeader() });
        const d = await res.json();
        if(!mounted || !d?.ok) return;
        const list = d.alerts || [];
        if(list.length){
          const newest = list[0];
          since = newest.ts || since;
          setAlertCount((n) => n + list.length);
          setLatestAlert(newest);
        }
      }catch(_){}
    }

    pollAlerts();
    const id = setInterval(pollAlerts, 15000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return (
    <header className="p-4 bg-gradient-to-r from-primary to-accent text-white border-b">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {avatar ? <img src={avatar} alt="me" className="w-9 h-9 rounded-full object-cover"/> : <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-semibold">{(user||'U').slice(0,2).toUpperCase()}</div>}
        <div>
          <div className="text-sm text-white/90">Welcome, <span className="font-medium">{user}</span></div>
          <div className="text-xs text-white/80">Role: <span className="font-semibold">{role}</span></div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={()=>setDark(!dark)} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20">{dark? 'Light':'Dark'}</button>
        <button onClick={()=>{ setAlertCount(0); setLatestAlert(null); }} className="px-3 py-1 rounded bg-red-600 hover:bg-red-700">
          Alerts {alertCount > 0 ? `(${alertCount})` : ''}
        </button>
        <Link to="/profile" className="px-3 py-1 rounded bg-white/10 hover:bg-white/20">Profile</Link>
        <button onClick={logout} className="px-3 py-1 rounded bg-red-500 hover:bg-red-600">Logout</button>
      </div>
      </div>
      {latestAlert && (
        <div className="mt-3 text-sm bg-red-700/90 px-3 py-2 rounded">
          Privacy Alert: {latestAlert.action} on {latestAlert.path || 'unknown path'} ({latestAlert.user || 'unknown user'})
        </div>
      )}
    </header>
  )
}
