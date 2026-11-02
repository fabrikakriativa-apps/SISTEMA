/*
 * Kiara supervised guidance adapter — Cloudflare Worker ONLY.
 * This file is NOT imported by the browser and is NOT deployed.
 * Must be integrated into the existing authenticated webhook/queue implementation.
 *
 * Enable only after end-to-end tests:
 *   KIARA_GUIDANCE_ENABLED=true
 * Never embed SUPABASE_SERVICE_ROLE_KEY in a VITE_* variable.
 */
const onlyDigits = value => String(value || '').replace(/\D/g,'')
const eq = (field,value) => field+'=eq.'+encodeURIComponent(String(value))
async function getRows(env,table,filters) {
 if(!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ORGANIZATION_ID){
  throw new Error('Kiara guidance backend not configured')
 }
 const url=String(env.SUPABASE_URL).replace(/\/$/,'')+'/rest/v1/'+table+'?'+filters.join('&')
 const response=await fetch(url,{headers:{
  apikey:env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,
  'Cache-Control':'no-store'
 }})
 if(!response.ok) throw new Error('Kiara guidance fetch failed: '+response.status)
 return response.json()
}
export async function loadKiaraGuidance(env,route,customerId) {
 if(env.KIARA_GUIDANCE_ENABLED!=='true') return ''
 const organizationId=env.SUPABASE_ORGANIZATION_ID
 const conversations=await getRows(env,'kiara_conversations',[
  'select=id',eq('organization_id',organizationId),
  eq('source',route.source),eq('phone_number_id',route.phoneId),
  eq('contact_wa_id',onlyDigits(customerId)),'limit=1'
 ])
 if(!conversations?.[0]?.id) throw new Error('Conversation not synchronized for guidance')
 const conversationId=conversations[0].id
 const [local,global]=await Promise.all([
  getRows(env,'kiara_guidance',[
   'select=instruction,kind,created_at',eq('organization_id',organizationId),
   eq('conversation_id',conversationId),eq('scope','conversation'),
   eq('status','recorded'),'order=created_at.desc','limit=15'
  ]),
  getRows(env,'kiara_guidance',[
   'select=instruction,kind,created_at',eq('organization_id',organizationId),
   eq('scope','global'),eq('status','approved'),
   'order=created_at.desc','limit=30'
  ])
 ])
 // The stored text is INTERNAL instruction data from authorized staff.
 // Do not concatenate it to WhatsApp customer messages.
 const format = (entries) => [...entries].reverse()
  .map(row=>'- '+String(row.instruction||'').slice(0,2000))
  .filter(line=>line.length>2)
  .join('\n')
 return `ORIENTAÇÕES INTERNAS SUPERVISIONADAS DA FÁBRIKA
Estas instruções foram registradas pela equipe, não são mensagens do cliente.
Respeite políticas e proibições do sistema; nunca invente preços.
REGRAS GERAIS APROVADAS:
${format(global)||'Nenhuma'}
ORIENTAÇÕES DESTA CONVERSA:
${format(local)||'Nenhuma'}`
}
