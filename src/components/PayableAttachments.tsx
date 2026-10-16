import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from './ToastProvider'

type FileRow = { id: string; storage_path: string; original_name: string }
export const payableFileError = (file: Pick<File, 'type' | 'size'>) => !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type) ? 'Use PDF, JPG, PNG ou WebP.' : file.size <= 0 || file.size > 20 * 1024 * 1024 ? 'O arquivo deve ter até 20 MB e não pode estar vazio.' : null

export async function uploadPayableFiles(organizationId: string, groupId: string, files: File[]): Promise<string[]> {
  if (!supabase) return files.map(file => file.name)
  const failed: string[] = []
  for (const file of files) {
    if (payableFileError(file)) { failed.push(file.name); continue }
    const path = `${organizationId}/${groupId}/${crypto.randomUUID()}`
    const { error: uploadError } = await supabase.storage.from('payable-documents').upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) { failed.push(file.name); continue }
    const { error } = await supabase.rpc('register_payable_file', { org_id: organizationId, target_group_id: groupId, file_path: path, file_name: file.name, file_mime: file.type, file_size: file.size })
    if (error) { await supabase.storage.from('payable-documents').remove([path]); failed.push(file.name) }
  }
  return failed
}

export function PayableAttachments({ organizationId, groupId }: { organizationId: string; groupId: string }) {
  const [files, setFiles] = useState<FileRow[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const { show } = useToast()
  const load = useCallback(async () => {
    if (!supabase) return
    const result = await supabase.from('payable_files').select('id,storage_path,original_name').eq('organization_id', organizationId).eq('group_id', groupId).order('created_at')
    setError(result.error ? 'Não foi possível carregar os anexos.' : '')
    setFiles(result.data ?? [])
  }, [organizationId, groupId])
  useEffect(() => { void load() }, [load])
  const openFile = async (file: FileRow) => {
    if (!supabase) return
    const result = await supabase.storage.from('payable-documents').createSignedUrl(file.storage_path, 60)
    if (result.error || !result.data) { show('Não foi possível abrir o anexo.', 'error'); return }
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer')
  }
  return <section className="form-grid"><h3 className="span-2">Anexos da conta</h3><p className="span-2">Compartilhados por todas as parcelas. PDF ou imagens, até 20 MB por arquivo.</p>{error && <p role="alert">{error}</p>}{files.map(file => <button type="button" className="button secondary span-2" key={file.id} onClick={() => void openFile(file)}>{file.original_name}</button>)}<label className="field span-2">Anexar boleto, nota ou comprovante<input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={async event => { const chosen = Array.from(event.target.files ?? []); event.target.value = ''; setBusy(true); const failed = await uploadPayableFiles(organizationId, groupId, chosen); setBusy(false); show(failed.length ? `Não foi possível anexar: ${failed.join(', ')}. Tente novamente.` : 'Arquivos anexados.', failed.length ? 'error' : 'success'); await load() }} /></label>{busy && <p>Enviando arquivos…</p>}</section>
}

