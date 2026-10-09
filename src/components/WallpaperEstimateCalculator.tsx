import {useEffect,useState} from 'react'
import {DecimalInput} from './DecimalInput'
import {SearchSelect} from './SearchSelect'
import {supabase} from '../lib/supabase'
import {loadAllPages} from '../lib/loadAllPages'
import {money} from '../lib/format'
import {calculateWallpaperEstimate,wallpaperEstimateDescription,type WallpaperEstimate} from '../lib/wallpaperEstimate'
import './UpholsteryEstimateCalculator.css'
type Supply={id:string;code:string;name:string;current_cost:number;width:string|null;length:string|null;vendor_code:string|null;collection:string|null}
export function WallpaperEstimateCalculator({organizationId,value,onChange,onApply}:{organizationId:string;value:WallpaperEstimate;onChange:(v:WallpaperEstimate)=>void;onApply:(sale:number,description:string)=>void}){
 const [supplies,setSupplies]=useState<Supply[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false),[search,setSearch]=useState<string|null>(null)
 useEffect(()=>{let active=true;void loadAllPages<Supply>((from,to)=>supabase!.from('supplies').select('id,code,name,current_cost,width:import_details->>Largura,length:import_details->>Comprimento,vendor_code:import_details->>"Código fornecedor",collection:import_details->>"Catálogo"').eq('organization_id',organizationId).eq('active',true).ilike('category','%papel%').order('code').order('id').range(from,to)).then(r=>{if(active){setSupplies(r.data??[]);setError(Boolean(r.error));setLoading(false)}});return()=>{active=false}},[organizationId])
 const r=calculateWallpaperEstimate(value),update=(v:Partial<WallpaperEstimate>)=>onChange({...value,...v})
 const numeric=(label:string,key:'wall_width'|'wall_height'|'roll_width'|'roll_length'|'roll_cost'|'waste_cm'|'rapport_cm'|'additional'|'margin')=><label className="field">{label}<DecimalInput value={value[key]} decimalScale={2} onValueChange={n=>update({[key]:n})}/></label>
 return <section className="upholstery-calculator span-2"><header><div><h3>Calculador de papel de parede</h3><p>Perda por faixa e mão de obra incluídas na estimativa.</p></div></header>
 <div className="form-grid"><div className="field span-2"><span>Papel cadastrado</span><SearchSelect ariaLabel="Buscar papel de parede" disabled={loading||error} value={search??[value.name,value.code].filter(Boolean).join(' · ')} placeholder={loading?'Carregando papéis…':'Digite código do fornecedor, código interno ou coleção'} options={supplies.map(s=>({id:s.id,label:`${s.name} · ${s.code} · ${s.vendor_code??''}`,detail:s.collection??''}))} onChange={setSearch} onSelect={o=>{const s=supplies.find(x=>x.id===o.id)!;setSearch(null);update({supply_id:s.id,code:s.code,name:s.collection||s.name,roll_width:Number(s.width)||0,roll_length:Number(s.length)||0,roll_cost:Number(s.current_cost),rolls_manual:null,labor_manual:null})}}/></div>
 {error&&<p role="alert">Não foi possível carregar os papéis. Feche e tente novamente.</p>}
 {numeric('Largura total das paredes (m)','wall_width')}{numeric('Altura da parede (m)','wall_height')}{numeric('Largura do rolo (m)','roll_width')}{numeric('Comprimento do rolo (m)','roll_length')}{numeric('Custo por rolo (R$)','roll_cost')}{numeric('Perda por faixa (cm)','waste_cm')}
 <label className="field"><span>Tem rapport?</span><select value={value.rapport?'yes':'no'} onChange={e=>update({rapport:e.target.value==='yes'})}><option value="no">Não</option><option value="yes">Sim</option></select></label>{value.rapport&&numeric('Reserva para rapport por faixa (cm)','rapport_cm')}
 <label className="field">Rolos necessários<DecimalInput value={r.rolls} decimalScale={0} onValueChange={n=>update({rolls_manual:n})}/>{value.rolls_manual!=null&&<button type="button" className="text-button" onClick={()=>update({rolls_manual:null})}>Usar cálculo automático</button>}</label>
 <label className="field">Mão de obra (R$)<DecimalInput value={r.labor} decimalScale={2} onValueChange={n=>update({labor_manual:n})}/>{value.labor_manual!=null&&<button type="button" className="text-button" onClick={()=>update({labor_manual:null})}>Usar cálculo automático</button>}</label>
 {numeric('Outros custos (R$)','additional')}{numeric('Margem (%)','margin')}</div>
 {r.invalid&&<p role="alert">O rolo não rende uma faixa inteira com esta altura e perdas. Confira as medidas.</p>}
 <div className="upholstery-summary"><div><span>Faixas necessárias</span><strong>{r.strips}</strong></div><div><span>Faixas por rolo</span><strong>{r.yieldPerRoll}</strong></div><div><span>Custo estimado</span><strong>{money.format(r.cost)}</strong></div><div className="upholstery-sale"><span>Valor sugerido</span><strong>{money.format(r.sale)}</strong></div></div>
 <footer><button type="button" className="button primary" disabled={!value.code||!r.rolls||r.invalid||value.wall_height<=0||value.wall_width<=0} onClick={()=>onApply(r.sale,wallpaperEstimateDescription(value))}>Usar valor e descrição</button></footer></section>
}
