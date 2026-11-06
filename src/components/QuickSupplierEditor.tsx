import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from './ToastProvider'

export function QuickSupplierEditor({ organizationId, onClose, onSaved }: { organizationId: string; onClose: () => void; onSaved: (supplier: { id: string; name: string }) => void }) {
  const { show } = useToast()
  const [form, setForm] = useState({ name: '', document: '', phone: '', email: '', supplier_types: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || saving || !form.name.trim()) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('suppliers').insert({ organization_id: organizationId, name: form.name.trim(), document: form.document.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null, supplier_types: form.supplier_types.split(',').map(value => value.trim()).filter(Boolean), notes: form.notes.trim() || null, active: true }).select('id,name').single()
      if (error || !data) { show(error?.code === '42501' ? 'Seu perfil não pode cadastrar fornecedores.' : 'Não foi possível cadastrar o fornecedor.', 'error'); return }
      onSaved(data)
      show('Fornecedor cadastrado e selecionado.', 'success')
    } catch { show('Não foi possível cadastrar o fornecedor. Tente novamente.', 'error') }
    finally { setSaving(false) }
  }
  return <div className="dialog-backdrop" style={{ zIndex: 101 }}><form className="dialog" role="dialog" aria-modal="true" aria-label="Novo fornecedor" onSubmit={save}>
    <header><div><span className="eyebrow">Cadastro</span><h2>Novo fornecedor</h2><p>O lançamento em preenchimento será mantido.</p></div></header>
    <div className="form-grid">{([['name','Nome'],['document','CPF/CNPJ'],['phone','Telefone'],['email','E-mail'],['supplier_types','Tipos fornecidos (separados por vírgula)'],['notes','Observações']] as const).map(([key,label])=><label className={`field ${['name','supplier_types','notes'].includes(key)?'span-2':''}`} key={key}>{label}<input autoFocus={key==='name'} required={key==='name'} type={key==='email'?'email':'text'} value={form[key]} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}</div>
    <footer><button type="button" className="button secondary" disabled={saving} onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving || !form.name.trim()}>{saving ? 'Salvando…' : 'Salvar fornecedor'}</button></footer>
  </form></div>
}
