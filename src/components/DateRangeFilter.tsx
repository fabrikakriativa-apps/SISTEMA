export type DateRange={from:string;to:string}

const key=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`

export function DateRangeFilter({value,onChange,label='Período'}:{value:DateRange;onChange:(value:DateRange)=>void;label?:string}){
 const preset=(period:string)=>{const now=new Date();if(period==='all'){onChange({from:'',to:''});return}if(period==='month'){onChange({from:key(new Date(now.getFullYear(),now.getMonth(),1)),to:key(new Date(now.getFullYear(),now.getMonth()+1,0))});return}const days=Number(period.replace(/\D/g,''))||1;if(period.startsWith('past')){const start=new Date(now);start.setDate(start.getDate()-days+1);onChange({from:key(start),to:key(now)});return}const end=new Date(now);end.setDate(end.getDate()+days-1);onChange({from:key(now),to:key(end)})}
 return <div className="date-range-filter" aria-label={label}>
  <label>De<input type="date" value={value.from} onChange={event=>onChange({...value,from:event.target.value})}/></label>
  <label>Até<input type="date" value={value.to} onChange={event=>onChange({...value,to:event.target.value})}/></label>
  <select aria-label={`Atalho de ${label.toLowerCase()}`} value="" onChange={event=>event.target.value&&preset(event.target.value)}>
   <option value="">Período rápido</option><option value="all">Todo o período</option><option value="1">Hoje</option><option value="past7">Últimos 7 dias</option><option value="past30">Últimos 30 dias</option><option value="7">Próximos 7 dias</option><option value="30">Próximos 30 dias</option><option value="month">Mês atual</option>
  </select>
 </div>
}

export const inDateRange=(value:string|null|undefined,range:DateRange)=>{
 if(!range.from&&!range.to)return true
 if(!value)return false
 const date=value.slice(0,10)
 return(!range.from||date>=range.from)&&(!range.to||date<=range.to)
}
