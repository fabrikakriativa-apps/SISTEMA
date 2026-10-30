export type CaptureKind='unknown'|'organic'|'paid'
export const captureKindLabels:Record<CaptureKind,string>={unknown:'Não identificado',organic:'Orgânico',paid:'Campanha paga'}
export const leadOrigins=['Meta — Instagram/Facebook','Instagram','Facebook','Google','Indicação','Porta de loja','WhatsApp','Site','Outro']
type Attribution={capture_kind?:CaptureKind|null;campaign?:string|null;origin?:string|null}
// Never infer paid/organic from a social network, agency name, or legacy campaign.
export const captureKind=(lead:Attribution):CaptureKind=>lead.capture_kind==='paid'||lead.capture_kind==='organic'?lead.capture_kind:'unknown'
export function acquisitionLabel(lead:Attribution){
 const kind=captureKind(lead),campaign=lead.campaign?.trim()
 return kind==='paid'?`Campanha: ${campaign||'não informada'}`:campaign?`${captureKindLabels[kind]} · Campanha: ${campaign}`:captureKindLabels[kind]
}
export function matchesAcquisition(lead:Attribution,filter:string){return !filter||captureKind(lead)===filter}

