type SearchOption={id:string;label:string;detail?:string}
export const normalizeSearchText=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim()

// Match every typed fragment, regardless of accents or the order of words.
// This only filters suggestions: it never changes which record is selected.
export function matchesSearch(text:string,query:string):boolean {
  const haystack=normalizeSearchText(text)
  return normalizeSearchText(query).split(' ').filter(Boolean).every(term=>haystack.includes(term))
}
export function searchOptions<T extends SearchOption>(options:T[],value:string):T[] {
  return options.filter(option=>matchesSearch(`${option.label} ${option.detail??''}`,value))
}
