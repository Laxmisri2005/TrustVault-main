import React from 'react'

export default function Compliance(){
  const items = [
    ['Encryption at Rest','AES-256'],
    ['Encryption in Transit','HTTPS (TLS 1.2+)'],
    ['IAM Access Control','Enabled'],
    ['Audit Logging','Enabled'],
    ['GDPR-ready','Yes'],
    ['HIPAA-ready','Depends on configuration']
  ]
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Compliance</h2>
      <div className="grid grid-cols-2 gap-4">
        {items.map(i=> (
          <div
            key={i[0]}
            className="p-4 bg-white dark:bg-slate-950/40 dark:border dark:border-slate-700/40 rounded shadow"
          >
            <strong>{i[0]}</strong>
            <div className="mt-2">{i[1]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
