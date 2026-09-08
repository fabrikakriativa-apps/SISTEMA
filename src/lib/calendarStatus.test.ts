import {describe,expect,it} from 'vitest'
import {needsCalendarSync} from './calendarStatus'

describe('calendar synchronization status',()=>{
  it('retries pending events and previous failures',()=>{expect(needsCalendarSync('pending')).toBe(true);expect(needsCalendarSync('error')).toBe(true)})
  it('does not resend synchronized events',()=>expect(needsCalendarSync('synced')).toBe(false))
})
