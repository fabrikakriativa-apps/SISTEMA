import {describe,it,expect} from 'vitest'
import {loadAllPages} from './loadAllPages'
describe('complete catalog loading',()=>{
  it('loads all 488 records, including later pages',async()=>{
    const records=Array.from({length:488},(_,id)=>({id}))
    const result=await loadAllPages(async(from,to)=>({data:records.slice(from,to+1),error:null,count:records.length}))
    expect(result.data).toEqual(records)
  })
  it('does not skip rows when the API imposes a smaller limit',async()=>{
    const records=Array.from({length:489},(_,id)=>({id}))
    const result=await loadAllPages(async from=>({data:records.slice(from,from+100),error:null,count:records.length}))
    expect(result.data).toEqual(records)
  })
  it('does not expose a partial list after a failed page',async()=>{
    const result=await loadAllPages(async from=>from?{data:null,error:'offline'}:{data:[{id:1}],count:2,error:null})
    expect(result.data).toBeNull();expect(result.error).toBe('offline')
  })
  it('detects an incomplete response instead of claiming the client does not exist',async()=>{
    const result=await loadAllPages(async from=>({data:from?[]:[{id:1}],count:2,error:null}))
    expect(result.data).toBeNull();expect(result.error).toBeInstanceOf(Error)
  })
  it('loads until the last page when no count is available',async()=>{
    const result=await loadAllPages(async from=>({data:from<3?[from]:[],error:null}))
    expect(result.data).toEqual([0,1,2])
  })
})
