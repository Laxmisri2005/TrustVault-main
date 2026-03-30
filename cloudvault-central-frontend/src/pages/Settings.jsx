import React, { useEffect, useState } from 'react'

export default function Settings(){
  const [interval, setInterval] = useState('30d');
  const [alerts, setAlerts] = useState(() => localStorage.getItem('cv_alerts') !== 'false');

  useEffect(() => {
    localStorage.setItem('cv_alerts', alerts ? 'true' : 'false');
  }, [alerts]);

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Settings</h2>
      <div className="bg-white dark:bg-slate-950/40 dark:border dark:border-slate-700/40 p-4 rounded shadow">
        <label className="block mb-2">Rotation interval</label>
        <input value={interval} onChange={e=>setInterval(e.target.value)} className="border p-2 rounded w-64" />
        <div className="mt-4">
          <label className="mr-2">Enable Alerts</label>
          <input type="checkbox" checked={alerts} onChange={e=>setAlerts(e.target.checked)} />
        </div>
      </div>
      <div className="mt-4 bg-white dark:bg-slate-950/40 dark:border dark:border-slate-700/40 p-4 rounded shadow">
        <h3>Add Cloud Provider (UI only)</h3>
        <p>This is a UI placeholder — configure actual providers in the backend.</p>
      </div>
    </div>
  )
}
