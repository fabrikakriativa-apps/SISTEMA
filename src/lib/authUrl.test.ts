import{describe,expect,it}from'vitest'
import{cleanAuthenticationFragment}from'./authUrl'
describe('auth url',()=>{
 it('remove credenciais do fragmento após o login',()=>expect(cleanAuthenticationFragment({pathname:'/',search:'?v=1',hash:'#access_token=secret&refresh_token=secret'})).toBe('/?v=1'))
 it('preserva fragmentos comuns',()=>expect(cleanAuthenticationFragment({pathname:'/',search:'',hash:'#orcamentos'})).toBeNull())
})
