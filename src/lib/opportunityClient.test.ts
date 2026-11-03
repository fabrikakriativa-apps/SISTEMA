import {describe,it,expect} from 'vitest'
import {withOpportunityClient,registeredOpportunityName,resolveOpportunityNames} from './opportunityClient'
const client={id:'c',name:'Cliente cadastrado',phone:'11999999999',email:'cliente@example.test'}
const blank={client_id:null as string|null,name:'',phone:'',email:'',stage:'new',profile_status:'unassessed'}
describe('cliente da oportunidade',()=>{
 it('preenche nome telefone e email sem alterar a etapa ou perfil',()=>expect(withOpportunityClient(blank,client)).toEqual({...blank,client_id:'c',name:client.name,phone:client.phone,email:client.email}))
 it('mantém dados digitados quando o cadastro não tem os campos',()=>expect(withOpportunityClient({...blank,phone:'123',email:'contato@example.test'},{...client,phone:null,email:null})).toMatchObject({phone:'123',email:'contato@example.test'}))
 it('não deixa telefone e email de outro cliente ao trocar o vínculo',()=>expect(withOpportunityClient({...blank,client_id:client.id,name:client.name,phone:client.phone,email:client.email},{id:'next',name:'Outro cliente',phone:null,email:null},client)).toMatchObject({client_id:'next',name:'Outro cliente',phone:'',email:''}))
})

describe('nome do cadastro vinculado',()=>{
 it('usa o nome do cadastro mesmo com nome antigo preenchido',()=>expect(registeredOpportunityName({...blank,client_id:'c',name:'Apelido'},[client])).toBe(client.name))
 it('preserva o contato sem cadastro e o vínculo indisponível',()=>{expect(registeredOpportunityName({...blank,name:'Manual'},[client])).toBe('Manual');expect(registeredOpportunityName({...blank,client_id:'inexistente',name:'Manual'},[client])).toBe('Manual')})
 it('atualiza quadro, busca e resultados sem alterar dados comerciais ou os objetos originais',()=>{const old={...blank,client_id:'c',name:'Antigo',campaign:'Outubro',response_status:'waiting'};expect(resolveOpportunityNames([old],[client])).toEqual([{...old,name:client.name}]);expect(old.name).toBe('Antigo');expect(resolveOpportunityNames([old],[{...client,name:'Nome corrigido'}])[0].name).toBe('Nome corrigido')})
})
