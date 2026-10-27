// Quote PostgREST values so punctuation cannot introduce extra filters.
export function supplyCategoryOptions(rows:{category:string|null}[]){
 return [...new Set(rows.map(row=>row.category).filter((value):value is string=>Boolean(value?.trim())))].sort((a,b)=>a.localeCompare(b,'pt-BR'))
}

export function catalogSearchFilter(term:string){
 const pattern=`"%${term.trim().replace(/[\\"%_]/g,char=>`\\${char}`)}%"`
 return `code.ilike.${pattern},name.ilike.${pattern},category.ilike.${pattern}`
}
