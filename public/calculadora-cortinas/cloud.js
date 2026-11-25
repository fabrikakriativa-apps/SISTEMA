(()=>{
  const SUPABASE_URL='https://dpowbyexrcdcwwqysgzp.supabase.co';
  const SUPABASE_KEY='sb_publishable_5R2zVzcZQVAGGd72zXayFQ_zCp_tJkU';
  const status=document.querySelector('#cloudVisitStatus'),message=document.querySelector('#cloudVisitMessage');
  if(!window.supabase){message.textContent='Conexão com o banco indisponível. O orçamento continua salvo neste aparelho.';return}
  const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY),phone=document.querySelector('#clientPhone');
  let session=null,organizationId=null,quoteId=localStorage.getItem('fk-curtain-cloud-quote-id')||null,autosaveTimer=null;
  phone.value=localStorage.getItem('fk-curtain-client-phone')||'';
  phone.addEventListener('input',()=>localStorage.setItem('fk-curtain-client-phone',phone.value));
  const setStatus=(label,kind='')=>{status.textContent=label;status.className=`cloud-status ${kind}`};
  const mutablePayload=()=>({client_name:state.client||null,client_phone:phone.value||null,project_reference:state.reference||null,neighborhood:state.neighborhood||null,calculator_state:budgetData(),result_payload:crmPayload(),rules_version:'curtain-engine-v17'});
  async function saveCloud(finalize=false,silent=false){
    if(!session||!organizationId){if(!silent)toast('Abra a calculadora pelo CRM e entre na sua conta para salvar no banco');return}
    setStatus('Salvando…','pending');
    try{
      let result;
      if(quoteId)result=await db.from('curtain_visit_quotes').update({...mutablePayload(),status:finalize?'finalized':'draft'}).eq('id',quoteId).eq('organization_id',organizationId).select('id,reference_code,status').single();
      else result=await db.from('curtain_visit_quotes').insert({...mutablePayload(),organization_id:organizationId,status:finalize?'finalized':'draft',created_by:session.user.id}).select('id,reference_code,status').single();
      if(result.error)throw result.error;
      quoteId=result.data.id;localStorage.setItem('fk-curtain-cloud-quote-id',quoteId);setStatus(`${result.data.reference_code} · ${finalize?'Finalizada':'Salva no CRM'}`,'online');
      if(!silent)toast(finalize?'Visita finalizada e pronta para importar no CRM':'Rascunho salvo no CRM');
      await loadHistory();
    }catch(error){setStatus('Salvo no aparelho · sincronização pendente','pending');localStorage.setItem('fk-curtain-cloud-pending','1');if(!silent)toast(`Não foi possível sincronizar: ${error.message||'verifique a conexão'}`)}
  }
  async function loadHistory(){
    if(!organizationId)return;const host=document.querySelector('#cloudVisitHistory');
    const {data}=await db.from('curtain_visit_quotes').select('id,reference_code,status,client_name,project_reference,updated_at,calculator_state').eq('organization_id',organizationId).in('status',['draft','finalized']).order('updated_at',{ascending:false}).limit(20);
    host.innerHTML=data?.length?`<h2 class="cloud-history-heading">Visitas salvas no CRM</h2>`:'';
    (data||[]).forEach(row=>{const card=document.createElement('article');card.className='cloud-history-card';card.innerHTML=`<div><strong>${row.reference_code} · ${row.client_name||'Cliente não informado'}</strong><span>${row.project_reference||'Sem referência'} · ${row.status==='finalized'?'Finalizada':'Rascunho'}</span></div><button type="button" class="btn secondary">Abrir</button>`;card.querySelector('button').onclick=()=>{state={...state,...structuredClone(row.calculator_state),prices:state.prices,currentBudgetId:null};quoteId=row.id;localStorage.setItem('fk-curtain-cloud-quote-id',quoteId);['client','reference','neighborhood','discount'].forEach(key=>{const el=document.querySelector(`#${key}`);if(el)el.value=state[key]??''});save();renderAll();setStatus(`${row.reference_code} · Em edição`,'online');document.querySelector('[data-view="orcamento"]').click()};host.appendChild(card)});
  }
  async function init(){
    const auth=await db.auth.getSession();session=auth.data.session;
    if(!session){setStatus('Entre pelo CRM','pending');message.innerHTML='Para salvar no banco, abra pelo <a href="https://fabrikakriativa-apps.github.io/SISTEMA/">CRM da Fábrika Kriativa</a>. O cálculo local continua disponível.';return}
    const membership=await db.from('memberships').select('organization_id,role').eq('user_id',session.user.id).in('role',['admin','comercial']).limit(1).maybeSingle();
    if(membership.error||!membership.data){setStatus('Sem permissão de orçamento','pending');return}
    organizationId=membership.data.organization_id;setStatus('Conectado ao CRM','online');message.textContent='A visita fica disponível no pré-orçamento e no orçamento para importar como um único item Cortina.';
    await loadHistory();
    if(localStorage.getItem('fk-curtain-cloud-pending')){await saveCloud(false,true);localStorage.removeItem('fk-curtain-cloud-pending')}
  }
  document.querySelector('#cloudSaveDraft').onclick=()=>saveCloud(false);
  document.querySelector('#cloudFinalize').onclick=()=>saveCloud(true);
  document.querySelector('#newBudget').addEventListener('click',()=>{quoteId=null;localStorage.removeItem('fk-curtain-cloud-quote-id');setStatus(organizationId?'Novo rascunho':'Somente neste aparelho',organizationId?'online':'')});
  document.addEventListener('input',()=>{if(!session||!organizationId)return;clearTimeout(autosaveTimer);autosaveTimer=setTimeout(()=>saveCloud(false,true),1800)});
  window.addEventListener('online',()=>saveCloud(false,true));init();
})();
