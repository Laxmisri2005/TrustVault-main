import React from 'react'
import { parseJwt, getStoredToken } from '../utils/auth'

export default function Profile(){
  const t = getStoredToken();
  const p = parseJwt(t) || {};
  const name = (p.user && String(p.user)) || 'User One';
  const initials = name.split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase();
  const stored = localStorage.getItem('cv_avatar');
  const grav = localStorage.getItem('cv_gravatar');
  const avatarSrc = stored ? stored : (grav ? `https://www.gravatar.com/avatar/${grav}?s=128&d=identicon` : null);

  function logout(){
    localStorage.removeItem('cv_token');
    localStorage.removeItem('cv_role');
    localStorage.removeItem('cv_user');
    window.location.reload();
  }

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-slate-950/40 dark:border dark:border-slate-700/40 rounded shadow p-6">
      <div className="flex items-center gap-4 mb-4">
        <div>
          {avatarSrc ? <img src={avatarSrc} alt="avatar" className="w-14 h-14 rounded-full object-cover"/> : <div className="avatar" aria-hidden>{initials}</div>}
        </div>
        <div>
          <h2 className="text-2xl font-semibold">{name}</h2>
          <div className="text-sm panel-muted">Role: {p.role || 'n/a'}</div>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm text-gray-600 dark:text-gray-300">Upload photo</label>
        <input type="file" accept="image/*" onChange={async (e)=>{
          const f = e.target.files && e.target.files[0]; if(!f) return;
          const b = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });
          localStorage.setItem('cv_avatar', b); window.location.reload();
        }} />
      </div>

      <div className="mb-4">
        <label className="block text-sm text-gray-600 dark:text-gray-300">Gravatar email (optional)</label>
        <input defaultValue={localStorage.getItem('cv_gravatar')||''} onBlur={(e)=>{ const v=(e.target.value||'').trim().toLowerCase(); localStorage.setItem('cv_gravatar', v); window.location.reload(); }} className="w-full px-3 py-2 border rounded" placeholder="email@example.com" />
      </div>

      <div className="mb-4">
        <div className="text-sm text-gray-600 dark:text-gray-300">Token expires</div>
        <div className="font-medium">{p.exp ? new Date(p.exp*1000).toLocaleString() : 'n/a'}</div>
      </div>
      <div className="flex gap-2">
        <button onClick={logout} className="px-3 py-1 bg-red-600 text-white rounded">Logout</button>
      </div>
    </div>
  )
}

