import React from 'react'

export default function Button({children, variant='primary', className='', ...props}){
  const base = 'px-3 py-1 rounded inline-flex items-center gap-2 font-medium';
  const variants = {
    primary: 'bg-primary text-white',
    neutral: 'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-200',
    danger: 'bg-red-600 text-white',
    warn: 'bg-yellow-500 text-white'
  }
  return (
    <button className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props}>{children}</button>
  )
}
