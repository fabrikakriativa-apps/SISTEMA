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

// Supply search covers the generated server index, not just the current page.
export function supplySearchOptions(term:string){
 const words=normalizeSearchText(term.replace(/r\$\s*/gi,' ')).split(' ').filter(Boolean)
 const states=words.filter(word=>/^(?:in)?ativos?$/.test(word)).map(word=>!word.startsWith('in'))
 const active=states.length&&states.every(value=>value===states[0])?states[0]:undefined
 const text=words.filter(word=>active===undefined||!/^(?:in)?ativos?$/.test(word)).map(word=>/^\d{1,3}(?:\.\d{3})+,\d+$/.test(word)?word.replace(/\./g,''):word).join(' ')
 return {active,patterns:catalogSearchPatterns(text)}
}
