import type { ModuleKey } from '../domain'

const modules = new Set<ModuleKey>(['inicio','prospeccao','clientes','insumos','orcamentos','pedidos','compras','financeiro','agenda','fornecedores','administracao'])

export type AppRoute={module:ModuleKey;recordId:string|null}

export function readRoute(hash:string):AppRoute {
  const [rawModule,rawId]=hash.replace(/^#\/?/,'').split('/')
  const module=modules.has(rawModule as ModuleKey)?rawModule as ModuleKey:'inicio'
  return {module,recordId:rawId?decodeURIComponent(rawId):null}
}

export function routeHash(module:ModuleKey,recordId?:string|null){
  return `#/${module}${recordId?`/${encodeURIComponent(recordId)}`:''}`
}

export function navigateTo(module:ModuleKey,recordId?:string|null){
  const next=routeHash(module,recordId)
  if(window.location.hash===next) window.dispatchEvent(new HashChangeEvent('hashchange'))
  else window.location.hash=next
}
