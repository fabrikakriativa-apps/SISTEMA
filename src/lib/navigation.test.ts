import { describe,expect,it } from 'vitest'
import { readRoute,routeHash } from './navigation'

describe('navigation',()=>{
  it('abre um registro diretamente',()=>expect(readRoute('#/pedidos/abc-123')).toEqual({module:'pedidos',recordId:'abc-123'}))
  it('usa a visão geral para endereços inválidos',()=>expect(readRoute('#/desconhecido')).toEqual({module:'inicio',recordId:null}))
  it('gera endereço compartilhável',()=>expect(routeHash('orcamentos','id 1')).toBe('#/orcamentos/id%201'))
})
