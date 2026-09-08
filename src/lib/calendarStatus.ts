export const calendarSyncStatuses=['pending','error'] as const
export function needsCalendarSync(status:string){return (calendarSyncStatuses as readonly string[]).includes(status)}
