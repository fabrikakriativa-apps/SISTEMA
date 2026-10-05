export type SortState<K extends string=string>={key:K;direction:'asc'|'desc'}

export function SortableHeader<K extends string>({label,column,sort,onChange}:{label:string;column:K;sort:SortState<K>;onChange:(sort:SortState<K>)=>void}){
 const active=sort.key===column
 return <th aria-sort={active?(sort.direction==='asc'?'ascending':'descending'):'none'}><button type="button" className="sort-header" onClick={()=>onChange({key:column,direction:active&&sort.direction==='asc'?'desc':'asc'})}>{label}<span aria-hidden="true">{active?(sort.direction==='asc'?'↑':'↓'):'↕'}</span></button></th>
}

export const compareValues=(left:unknown,right:unknown)=>{
 if(typeof left==='number'&&typeof right==='number')return left-right
 return String(left??'').localeCompare(String(right??''),'pt-BR',{numeric:true,sensitivity:'base'})
}
