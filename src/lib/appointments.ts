export const appointmentZone='America/Sao_Paulo'
export type AppointmentLinkKind='none'|'order'|'budget'|'pre_budget'
const format=new Intl.DateTimeFormat('en-CA',{timeZone:appointmentZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
export function appointmentLocal(instant:string|Date){const p=Object.fromEntries(format.formatToParts(new Date(instant)).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`}}
export function appointmentTimes(date:string,time:string,duration:number){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)||!Number.isInteger(duration)||duration<15||duration>10080)throw new Error('Informe data, horário e duração válidos.')
 const [y,m,d]=date.split('-').map(Number),[h,min]=time.split(':').map(Number),desired=Date.UTC(y,m-1,d,h,min),check=new Date(desired)
 if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d||h>23||min>59)throw new Error('Data ou horário inválido.')
 let candidate=desired
 for(let i=0;i<3;i++){const p=appointmentLocal(new Date(candidate)),[py,pm,pd]=p.date.split('-').map(Number),[ph,pmin]=p.time.split(':').map(Number);candidate+=desired-Date.UTC(py,pm-1,pd,ph,pmin)}
 const local=appointmentLocal(new Date(candidate));if(local.date!==date||local.time!==time)throw new Error('Este horário não existe no fuso de Brasília.')
 return {starts_at:new Date(candidate).toISOString(),ends_at:new Date(candidate+duration*60000).toISOString()}
}
export function appointmentDescriptionParts(description:string|null){const lines=(description??'').split('\n'),index=lines.findIndex(line=>line.startsWith('Endereço: '));return {address:index<0?'':lines[index].slice(10),notes:lines.filter((_,i)=>i!==index).join('\n')}}
