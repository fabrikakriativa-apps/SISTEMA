import {describe,expect,it} from 'vitest'
import {blankHeadboard,headboardDescription} from './headboard'

describe('descrição de cabeceira',()=>{
 it('usa somente características confirmadas',()=>expect(headboardDescription({...blankHeadboard,model:'Gomos',covering:'Linho',color:'Areia',width:2.4,height:1.2,depth:.08,fixing:'na parede'})).toBe('Cabeceira Gomos - Linho - Areia, medindo 2,4 × 1,2 × 0,08 m, fixação na parede.'))
 it('aceita cadastro inicial sem inventar acabamento',()=>expect(headboardDescription(blankHeadboard)).toBe('Cabeceira.'))
})
