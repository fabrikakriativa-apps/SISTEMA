export type HeadboardDetails={model:string;covering:string;color:string;width:number;height:number;depth:number;quantity:number;fixing:string}

export const blankHeadboard:HeadboardDetails={model:'',covering:'',color:'',width:0,height:0,depth:0,quantity:1,fixing:''}

const measure=(value:number)=>value>0?value.toLocaleString('pt-BR',{maximumFractionDigits:3}):''

export function headboardDescription(value:HeadboardDetails){
 const identity=[value.model,value.covering,value.color].map(item=>item.trim()).filter(Boolean).join(' - ')
 const dimensions=value.width>0&&value.height>0?`${measure(value.width)} × ${measure(value.height)}${value.depth>0?` × ${measure(value.depth)}`:''} m`:''
 return [`Cabeceira${identity?` ${identity}`:''}`,dimensions?`medindo ${dimensions}`:'',value.fixing.trim()?`fixação ${value.fixing.trim()}`:''].filter(Boolean).join(', ')+'.'
}
