export type PageResult<T> = { data:T[]|null; error:unknown; count?:number|null }

// Advance by the rows actually returned: API limits may be smaller than our requested page.
export async function loadAllPages<T>(page:(from:number,to:number)=>PromiseLike<PageResult<T>>,pageSize=200):Promise<PageResult<T>> {
  const data:T[]=[]
  let count:number|null=null
  for(;;) {
    const result=await page(data.length,data.length+pageSize-1)
    if(result.error)return {data:null,error:result.error,count}
    if(result.count!==undefined&&result.count!==null)count=result.count
    const rows=result.data??[]
    if(!rows.length) {
      if(count!==null&&data.length<count)return {data:null,error:new Error('A lista de cadastros retornou incompleta. Tente carregar novamente.'),count}
      return {data,error:null,count}
    }
    data.push(...rows)
    if(count!==null&&data.length>=count)return {data,error:null,count}
  }
}
