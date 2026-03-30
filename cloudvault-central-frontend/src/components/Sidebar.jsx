import React from 'react'
import { NavLink } from 'react-router-dom'

const items = [
  ['Dashboard', '/dashboard'],
  ['Secrets', '/secrets'],
  ['Multi-Cloud Control', '/control'],
  ['Roles', '/roles'],
  ['Rotation', '/rotation'],
  ['Audit Logs', '/logs'],
  ['API Access', '/api-access'],
  ['Compliance', '/compliance'],
  ['Settings', '/settings'],
]

export default function Sidebar(){
  return (
    <aside className="w-64 bg-brand text-white border-r min-h-screen">
      <div className="p-6 border-b border-white/10">
        <h2 className="text-xl font-bold text-white">TrustVault Central</h2>
        <div className="text-sm text-white/80 mt-1">Secure Multi-Cloud Secrets</div>
      </div>
      <nav className="p-4">
        {items.map((i) => (
          <NavLink
            key={i[1]}
            to={i[1]}
            className={({ isActive }) =>
              'block py-2 px-3 rounded transition-colors duration-150 ' +
              (isActive ? 'bg-primary/20 text-white' : 'text-white/90 hover:bg-primary/10')
            }
          >
            {i[0]}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
