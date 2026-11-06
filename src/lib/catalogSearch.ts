import {normalizeSearchText} from './searchOptions'
// Quote PostgREST values so punctuation cannot introduce extra filters.
export function supplyCategoryOptions(rows:{category:string|null}[]){
 return [...new Set(rows.map(row=>row.category).filter((value):value is string=>Boolean(value?.trim())))].sort((a,b)=>a.localeCompare(b,'pt-BR'))
}

export function catalogSearchFilter(term:string){
 const pattern=`"%${term.trim().replace(/[\\"%_]/g,char=>`\\${char}`)}%"`
 return `code.ilike.${pattern},name.ilike.${pattern},category.ilike.${pattern}`
}

// Pass patterns through the client filter API, never interpolate them into .or().
export function catalogSearchPatterns(term:string){
 return normalizeSearchText(term).split(' ').filter(Boolean).map(word=>'%'+word.replace(/[\\%_]/g,char=>'\\'+char)+'%')
}
