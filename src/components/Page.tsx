import type { ReactNode } from 'react'
export function Page({ title, description, action, children, className = '' }: { title: string; description: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <div className={`page ${className}`}><header className="page-header"><div><h1>{title}</h1><p>{description}</p></div>{action}</header>{children}</div>
}
