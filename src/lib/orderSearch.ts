import {matchesSearch} from './searchOptions'

type SearchableOrder={display_number:string;client?:{name?:string|null}|null;budget?:{display_number?:string|null}|null;notes?:string|null;order_items?:{snapshot?:{environment?:string|null;description?:string|null}|null}[]|null}

// Use the actual approved item snapshots already loaded with the order.
export function matchesOrderSearch(order:SearchableOrder,term:string,statusLabel=''){
 const items=(order.order_items??[]).flatMap(item=>[item.snapshot?.environment,item.snapshot?.description])
 return matchesSearch([order.display_number,order.client?.name,order.budget?.display_number,statusLabel,order.notes,...items].filter(Boolean).join(' '),term)
}
