import { describe, expect, it } from 'vitest'
import { parseBrazilianNumber, previewSupplyImport, readSupplyRows } from './supplyImport'

const existing = [{ id: 'supply-1', code: 'TEC-01', name: 'Tecido linho', category: 'Tecido', purchase_unit: 'm', usage_unit: 'm', current_cost: 45, active: true }]

describe('importação de insumos', () => {
  it('prioriza código interno e categoria e preserva a tabela completa',()=>{
    const {rows}=readSupplyRows([['Código fornecedor','Código Interno','Nome','Tipo','Categoria','Fornecedor','Unidade de compra','Preço de compra','Itens de orçamento vinculados','Observações internas','Observações internas'],['ABC','TEC-1','Tecido','Insumo','Tecido','PROLAR','m',87,'Confecção; Reforma de estofados','Nota 1','Nota 2']])
    expect(rows[0].values).toMatchObject({code:'TEC-1',category:'Tecido',current_cost:87,usage_unit:'m',import_details:{Fornecedor:'PROLAR','Observações internas':'Nota 1\nNota 2'}})
  })
  it('não sobrescreve outro código com o mesmo nome',()=>{
    const [row]=previewSupplyImport([{rowNumber:2,values:{code:'TEC-02',name:'Tecido linho',category:'Tecido'}}],existing,'merge')
    expect(row.action).toBe('create')
  })
  it('lê custo brasileiro e cabeçalhos em português', () => {
    expect(parseBrazilianNumber('R$ 1.234,56')).toBe(1234.56)
    const result = readSupplyRows([['Código', 'Produto', 'Custo atual'], ['TEC-02', 'Tecido cru', '56,75']])
    expect(result.error).toBeUndefined()
    expect(result.rows[0].values).toMatchObject({ code: 'TEC-02', name: 'Tecido cru', current_cost: 56.75 })
  })

  it('atualiza pelo código e preserva os campos não preenchidos', () => {
    const [preview] = previewSupplyImport([{ rowNumber: 2, values: { code: 'TEC-01', name: 'Tecido linho', current_cost: 52.5 } }], existing, 'merge')
    expect(preview.action).toBe('update')
    expect(preview.result).toMatchObject({ purchase_unit: 'm', usage_unit: 'm', current_cost: 52.5 })
  })

  it('não permite acrescentar item sem código', () => {
    const [preview] = previewSupplyImport([{ rowNumber: 2, values: { name: 'Espuma D28' } }], existing, 'merge')
    expect(preview.action).toBe('invalid')
  })
})
