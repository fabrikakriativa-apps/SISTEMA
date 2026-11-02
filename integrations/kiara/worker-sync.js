/*
 * Kiara / Supabase bridge (Cloudflare Worker module)
 *
 * NOT wired into the live Worker yet.
 * Requires Worker secrets SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * variable SUPABASE_ORGANIZATION_ID, and KIARA_SYNC_ENABLED=true.
 * Never import this module from browser code.
 *
 * Call AFTER existing HMAC / webhook-key validation.
 */
const phone = v => String(v || '').replace(/\D/g,'')
const time = v => {
  const seconds = Number(v)
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString() : new Date().toISOString()
}
const base = env => {
  if (env.KIARA_SYNC_ENABLED !== 'true') return null
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ORGANIZATION_ID) {
    throw new Error('Kiara: Supabase synchronization is not configured')
  }
  return String(env.SUPABASE_URL).replace(/\/$/,'') + '/rest/v1'
}
async function query(env, table, method='GET', search='', data) {
  const url = base(env)
  if (!url) return null
  const response = await fetch(url+'/'+table+search,{
    method,
    headers:{
      'apikey':env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type':'application/json',
      'Prefer':method==='POST'?'resolution=ignore-duplicates,return=minimal':'return=minimal'
    },
    ...(data === undefined?{}:{body:JSON.stringify(data)})
  })
  if (!response.ok) {
    console.error('Kiara persistence failed',table,method,response.status)
    throw new Error('Kiara storage failed: '+response.status)
  }
  return response.status===204 || method!=='GET' ? null : response.json()
}
const filter = (key,value) => '&'+key+'=eq.'+encodeURIComponent(String(value))
const esc = value => encodeURIComponent(String(value))
const org = env => String(env.SUPABASE_ORGANIZATION_ID)

async function conversation(env,{source,numberId,waId,displayName,referral,stamp}) {
  const payload={
    organization_id:org(env),source,phone_number_id:String(numberId),
    contact_wa_id:phone(waId),contact_phone:phone(waId),
    contact_name:displayName||null,
    origin:referral?.source_type || null,
    ad_id:referral?.source_id || null,
    initial_referral:referral || null,
    first_message_at:stamp,last_interaction_at:stamp,
  }
  // Insert only; an existing status is NEVER overwritten by a new message.
  await query(env,'kiara_conversations','POST','?on_conflict=organization_id,source,phone_number_id,contact_wa_id',payload)
  const filterQuery='?select=id,status,contact_name,initial_referral'+filter('organization_id',org(env))+
    filter('source',source)+filter('phone_number_id',numberId)+filter('contact_wa_id',phone(waId))+'&limit=1'
  const found=await query(env,'kiara_conversations','GET',filterQuery)
  const existing=found?.[0]
  if (!existing) throw new Error('Kiara conversation not found after insertion')
  // Patch only mutable non-status fields. Never overwrite first-message referral.
  const patch={
    last_interaction_at:stamp,
    ...(displayName && !existing.contact_name?{contact_name:displayName}:{}),
  }
  await query(env,'kiara_conversations','PATCH','?id=eq.'+esc(existing.id)+filter('organization_id',org(env)),patch)
  return existing
}
async function recordMessage(env,{conversationId,messageId,direction,sender,text,messageType,stamp}) {
  if (!messageId) return
  await query(env,'kiara_messages','POST','?on_conflict=organization_id,whatsapp_message_id',{
    organization_id:org(env),conversation_id:conversationId,whatsapp_message_id:String(messageId),
    direction,sender,message_type:messageType||'text',text_body:text||null,occurred_at:stamp
  })
}
function customerName(value,waId) {
  return value.contacts?.find(c=>phone(c.wa_id)===phone(waId))?.profile?.name || null
}
export async function recordIncoming(env,source,value,message) {
  if (env.KIARA_SYNC_ENABLED !== 'true') return
  if (!message?.id || !message?.from) return
  const stamp=time(message.timestamp), numberId=value.metadata?.phone_number_id
  if (!numberId) return
  const ref=message.referral || null
  const row=await conversation(env,{
    source,numberId,waId:message.from,displayName:customerName(value,message.from),
    referral:ref,stamp
  })
  await recordMessage(env,{
    conversationId:row.id,messageId:message.id,direction:'incoming',
    sender:'customer',messageType:message.type,
    text:message.type==='text'?message.text?.body:null,stamp
  })
}
export async function recordHumanEcho(env,source,value,message) {
  if (env.KIARA_SYNC_ENABLED !== 'true') return
  const waId=phone(message?.to || message?.recipient_id)
  const numberId=value.metadata?.phone_number_id
  if (!message?.id || !waId || !numberId) return
  const stamp=time(message.timestamp)
  const row=await conversation(env,{source,numberId,waId,stamp})
  await query(env,'kiara_conversations','PATCH','?id=eq.'+esc(row.id)+filter('organization_id',org(env)),{
    status:'human',last_business_message_at:stamp,updated_at:new Date().toISOString()
  })
  await recordMessage(env,{
    conversationId:row.id,messageId:message.id,direction:'outgoing',
    sender:'human',messageType:message.type,
    text:message.type==='text'?message.text?.body:null,stamp
  })
}
export async function recordKiaraReply(env,source,numberId,waId,messageId,text) {
  if (env.KIARA_SYNC_ENABLED !== 'true' || !messageId) return
  const stamp=new Date().toISOString()
  const row=await conversation(env,{source,numberId,waId,stamp})
  await recordMessage(env,{conversationId:row.id,messageId,direction:'outgoing',
    sender:'kiara',messageType:'text',text,stamp})
}
// No positive authorization => DO NOT SEND. This is for the future guarded Worker
// only, not a drop-in patch for the currently running Worker.
export async function canKiaraSend(env,source,numberId,waId) {
  if (env.KIARA_SYNC_ENABLED !== 'true') return false
  const control=await query(env,'kiara_operational_control','GET','?select=enabled'+filter('organization_id',org(env))+'&limit=1')
  if (control?.[0]?.enabled!==true) return false
  const matched=await query(env,'kiara_conversations','GET','?select=status'+
    filter('organization_id',org(env))+filter('source',source)+
    filter('phone_number_id',numberId)+filter('contact_wa_id',phone(waId))+'&limit=1')
  return matched?.[0]?.status==='ai'
}
