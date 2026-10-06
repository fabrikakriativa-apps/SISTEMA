type SearchOption={id:string;label:string;detail?:string}
export const normalizeSearchText=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim()
export function searchOptions<T extends SearchOption>(options:T[],value:string):T[] {
  const terms=normalizeSearchText(value).split(' ').filter(Boolean)
  return terms.length?options.filter(option=>{
    const text=normalizeSearchText(`${option.label} ${option.detail??''}`)
    return terms.every(term=>text.includes(term))
  }):options
}
