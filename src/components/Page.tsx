import type { ReactNode } from 'react'
export function Page({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return <div className="page"><header className="page-header"><div><span className="eyebrow">Fábrika Kriativa</span><h1>{title}</h1><p>{description}</p></div>{action}</header>{children}</div>
}
