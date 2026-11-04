import {supabase} from './supabase'

const endpoint=import.meta.env.VITE_KIARA_BUDGET_URL?.trim()||''
export const kiaraBudgetReviewConfigured=Boolean(/^https:\/\//.test(endpoint))

export type KiaraBudgetAction='approve'|'reject'|'send'

export async function reviewKiaraBudget(draftId:string,action:KiaraBudgetAction,note=''){
 if(!kiaraBudgetReviewConfigured||!supabase)throw new Error('Revisão de pré-orçamentos indisponível neste ambiente.')
 const {data:{session},error}=await supabase.auth.getSession()
 if(error||!session?.access_token)throw new Error('Entre novamente no SISTEMA para revisar o orçamento.')
 const response=await fetch(endpoint,{
  method:'POST',
  headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
  body:JSON.stringify({draftId,action,note})
 })
 const result=await response.json().catch(()=>({}))
 if(!response.ok)throw new Error(result.error||'A revisão não pôde ser confirmada.')
 return result as {ok:boolean,sent?:boolean,synchronized?:boolean}
}
