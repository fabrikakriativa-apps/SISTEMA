import { useEffect, useRef } from 'react'

export function readRecovery<T>(key:string):T|null {
  try{return JSON.parse(localStorage.getItem(`fabrika-draft:${key}`)??'null') as T|null}catch{return null}
}
export function writeRecovery(key:string,value:unknown){try{localStorage.setItem(`fabrika-draft:${key}`,JSON.stringify(value))}catch{/* Keep editing when storage is unavailable. */}}
export function clearRecovery(key:string){try{localStorage.removeItem(`fabrika-draft:${key}`)}catch{/* Storage unavailable. */}}

// Persist synchronously when a controlled form changes, before any network debounce.
export function useRecoveryDraft<T>(key:string,value:T,enabled=true){
  const previous=useRef<string>('')
  useEffect(()=>{if(!enabled)return;const encoded=JSON.stringify(value);if(encoded!==previous.current){writeRecovery(key,value);previous.current=encoded}},[key,value,enabled])
}
