import { describe,expect,it,vi } from 'vitest'
import { sendToGoogle } from './googleCalendar'
const base={id:'1',title:'PED-1 · Sala',description:'Instalação',starts_at:'2026-09-07T13:00:00.000Z',ends_at:null,cancelled_at:null,google_event_id:null}
describe('Google Calendar sync',()=>{
 it('creates an event with a one-hour default duration',async()=>{const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:'google-1'})});expect(await sendToGoogle(base,'token',request as unknown as typeof fetch)).toEqual({googleEventId:'google-1'});expect(request).toHaveBeenCalledWith(expect.stringContaining('/events'),expect.objectContaining({method:'POST',body:expect.stringContaining('2026-09-07T14:00:00.000Z')}))})
 it('deletes a cancelled linked event',async()=>{const request=vi.fn().mockResolvedValue({ok:true,status:204});await sendToGoogle({...base,cancelled_at:'2026-09-06T10:00:00Z',google_event_id:'google-1'},'token',request as unknown as typeof fetch);expect(request).toHaveBeenCalledWith(expect.stringContaining('google-1'),expect.objectContaining({method:'DELETE'}))})
 it('requires reconnection after an unauthorized response',async()=>{const request=vi.fn().mockResolvedValue({ok:false,status:401});await expect(sendToGoogle(base,'token',request as unknown as typeof fetch)).rejects.toThrow('reauthorize')})
})
