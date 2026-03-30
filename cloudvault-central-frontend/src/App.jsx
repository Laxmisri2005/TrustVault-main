import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Dashboard from './pages/Dashboard'
import Secrets from './pages/Secrets'
import Control from './pages/Control'
import Roles from './pages/Roles'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Rotation from './pages/Rotation'
import Logs from './pages/Logs'
import ApiAccess from './pages/ApiAccess'
import Compliance from './pages/Compliance'
import Settings from './pages/Settings'
import { getStoredToken, isTokenExpired } from './utils/auth'

export default function App(){
  const location = useLocation()
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('cv_theme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return !!window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  })
  const token = getStoredToken()
  const sessionAuthed = sessionStorage.getItem('cv_session_auth') === 'true'
  const isAuthed = !!token && !isTokenExpired(token) && sessionAuthed
  const isLoginRoute = location.pathname === '/login'

  useEffect(()=>{
    if(token && isTokenExpired(token)){
      localStorage.removeItem('cv_token')
      localStorage.removeItem('cv_role')
      localStorage.removeItem('cv_user')
      sessionStorage.removeItem('cv_session_auth')
    }
  }, [token])

  useEffect(() => {
    // Tailwind `darkMode: 'class'` expects `dark` on <html>.
    document.documentElement.classList.toggle('dark', !!dark);
    localStorage.setItem('cv_theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <div>
      {!isAuthed ? (
        <div className="min-h-screen app-bg flex items-center justify-center p-6">
          <Routes>
            <Route path="/login" element={<Login/>} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      ) : (
        <div className="flex h-screen">
          {!isLoginRoute && <Sidebar />}
          <div className="flex-1 flex flex-col">
            {!isLoginRoute && <Topbar dark={dark} setDark={setDark} />}
            <main className={isLoginRoute ? 'p-0 h-full overflow-auto' : 'p-6 app-bg h-full overflow-auto'}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard/>} />
                <Route path="/secrets" element={<Secrets/>} />
                <Route path="/control" element={<Control/>} />
                <Route path="/roles" element={<Roles/>} />
                <Route path="/rotation" element={<Rotation/>} />
                <Route path="/logs" element={<Logs/>} />
                <Route path="/api-access" element={<ApiAccess/>} />
                <Route path="/compliance" element={<Compliance/>} />
                <Route path="/settings" element={<Settings/>} />
                <Route path="/profile" element={<Profile/>} />
                <Route path="/login" element={<Login/>} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </main>
          </div>
        </div>
      )}
    </div>
  )
}
