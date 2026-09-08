import {describe,expect,it} from 'vitest'
import {budgetDocumentPath,purchaseDocumentPath,safeDocumentName} from './documents'

describe('document paths',()=>{
  it('removes unsafe characters and preserves PDF extension',()=>expect(safeDocumentName('Cotação Régia / sala.pdf')).toBe('Cotacao-Regia-sala.pdf'))
  it('keeps every budget document inside its organization and budget',()=>expect(budgetDocumentPath('org','budget','pedido.pdf','file')).toBe('org/budgets/budget/file-pedido.pdf'))
  it('keeps every purchase document inside its organization and purchase',()=>expect(purchaseDocumentPath('org','purchase','pedido.pdf','file')).toBe('org/purchases/purchase/file-pedido.pdf'))
})
