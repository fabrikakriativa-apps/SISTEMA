export type WallpaperEstimate={supply_id:string;code:string;name:string;wall_width:number;wall_height:number;roll_width:number;roll_length:number;roll_cost:number;waste_cm:number;rapport:boolean;rapport_cm:number;rolls_manual:number|null;labor_manual:number|null;additional:number;margin:number}
export const blankWallpaperEstimate:WallpaperEstimate={supply_id:'',code:'',name:'',wall_width:0,wall_height:0,roll_width:0,roll_length:0,roll_cost:0,waste_cm:25,rapport:false,rapport_cm:64,rolls_manual:null,labor_manual:null,additional:0,margin:50}
export function calculateWallpaperEstimate(v:WallpaperEstimate){
 const positive=(x:number)=>Math.max(0,Number(x)||0)
 const strip=positive(v.wall_height)+positive(v.waste_cm)/100+(v.rapport?positive(v.rapport_cm)/100:0)
 const strips=v.roll_width>0?Math.ceil(positive(v.wall_width)/v.roll_width):0
 const yieldPerRoll=strip>0?Math.floor(positive(v.roll_length)/strip):0
 const suggested=strips>0&&yieldPerRoll>0?Math.ceil(strips/yieldPerRoll):0
 const rolls=v.rolls_manual==null?suggested:Math.ceil(positive(v.rolls_manual))
 const labor=v.labor_manual==null?(rolls>0?350+Math.max(0,rolls-3)*100:0):positive(v.labor_manual)
 const cost=Math.round((rolls*positive(v.roll_cost)+labor+positive(v.additional))*100)/100
 return {strip,strips,yieldPerRoll,rolls,suggested,labor,cost,sale:Math.round(cost*(1+positive(v.margin)/100)*100)/100,invalid:strips>0&&yieldPerRoll===0}
}
export function wallpaperEstimateDescription(v:WallpaperEstimate){const r=calculateWallpaperEstimate(v);const n=(x:number)=>x.toLocaleString('pt-BR',{maximumFractionDigits:3});return `Papel de parede ${[v.name,v.code].filter(Boolean).join(' - ')}. Parede medindo ${n(v.wall_width)} × ${n(v.wall_height)} m. ${r.rolls} rolo(s), rolo de ${n(v.roll_width)} × ${n(v.roll_length)} m.`}
