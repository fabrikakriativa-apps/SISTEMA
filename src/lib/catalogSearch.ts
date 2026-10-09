// Quote PostgREST values so punctuation cannot introduce extra filters.
export function catalogSearchFilter(term:string){
 const pattern=`"%${term.trim().replace(/[\\"%_]/g,char=>`\\${char}`)}%"`
 return `code.ilike.${pattern},name.ilike.${pattern},category.ilike.${pattern}`
}
