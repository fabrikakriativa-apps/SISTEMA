import * as XLSX from 'xlsx'

export type SupplyImportMode = 'merge' | 'update-only'

export type SupplyCatalogRecord = {
  id: string
  code: string
  name: string
  category: string
  purchase_unit: string
  usage_unit: string
  current_cost: number
  active: boolean
  import_details?: Record<string, string | number>
}

type ImportedValues = Partial<Omit<SupplyCatalogRecord, 'id'>>

export type SupplyImportRow = {
  rowNumber: number
  values: ImportedValues
  action: 'create' | 'update' | 'ignore' | 'invalid'
  message?: string
  existingId?: string
  result?: Omit<SupplyCatalogRecord, 'id'>
}

const aliases: Record<Exclude<keyof ImportedValues, 'import_details'>, string[]> = {
  code: ['codigo interno', 'codigo', 'cod', 'codigo do item', 'sku', 'referencia', 'ref'],
  name: ['nome', 'insumo', 'produto', 'material', 'descricao', 'descricao do item'],
  category: ['categoria', 'grupo', 'tipo'],
  purchase_unit: ['unidade de compra', 'unidade compra', 'un compra', 'compra'],
  usage_unit: ['unidade de uso', 'unidade uso', 'un uso', 'uso'],
  current_cost: ['preco de compra', 'custo atual', 'custo', 'valor', 'preco de custo', 'preco custo'],
  active: ['status', 'ativo', 'situacao'],
}

function text(value: unknown) { return String(value ?? '').trim() }
function normalized(value: unknown) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }

export function parseBrazilianNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  const raw = text(value).replace(/R\$/gi, '').replace(/\s/g, '')
  if (!raw) return undefined
  const normalizedValue = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const result = Number(normalizedValue)
  return Number.isFinite(result) ? result : undefined
}

function parseActive(value: unknown): boolean | undefined {
  const raw = normalized(value)
  if (!raw) return undefined
  if (['ativo', 'sim', 's', 'true', '1'].includes(raw)) return true
  if (['inativo', 'nao', 'n', 'false', '0'].includes(raw)) return false
  return undefined
}

function headerIndex(headers: unknown[], field: keyof typeof aliases) {
  for (const alias of aliases[field]) {
    const index = headers.findIndex(header => normalized(header) === alias)
    if (index >= 0) return index
  }
  return -1
}

export function readSupplyRows(table: unknown[][]): { rows: Array<{ rowNumber: number; values: ImportedValues }>; error?: string } {
  const [headers, ...content] = table
  if (!headers?.length) return { rows: [], error: 'A planilha não possui cabeçalho.' }
  const indexes = Object.fromEntries((Object.keys(aliases) as Array<keyof typeof aliases>).map(field => [field, headerIndex(headers, field)])) as Record<keyof typeof aliases, number>
  if (indexes.name < 0) return { rows: [], error: 'Não encontramos a coluna Nome, Insumo, Produto, Material ou Descrição.' }
  const rows = content.map((line, index) => {
    const stringValue = (field: keyof typeof aliases) => indexes[field] < 0 ? undefined : text(line[indexes[field]]) || undefined
    const importDetails: Record<string,string|number> = {}
    headers.forEach((header,column) => {
      const key = text(header), value = line[column]
      if (key && text(value)) importDetails[key] = key in importDetails ? `${importDetails[key]}\n${text(value)}` : typeof value === 'number' ? value : text(value)
    })
    const cost = indexes.current_cost < 0 ? undefined : parseBrazilianNumber(line[indexes.current_cost])
    const status = indexes.active < 0 ? undefined : parseActive(line[indexes.active])
    return { rowNumber: index + 2, values: { code: stringValue('code'), name: stringValue('name'), category: stringValue('category'), purchase_unit: stringValue('purchase_unit'), usage_unit: stringValue('usage_unit') ?? stringValue('purchase_unit'), current_cost: cost, active: status, ...(Object.keys(importDetails).length ? {import_details:importDetails} : {}) } }
  }).filter(row => Object.values(row.values).some(value => value !== undefined))
  return { rows }
}

export function readSupplyWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const firstSheet = workbook.SheetNames[0]
  if (!firstSheet) return { rows: [], error: 'Não encontramos uma aba na planilha.' }
  return { ...readSupplyRows(XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, defval: '' }) as unknown[][]), sheetName: firstSheet }
}

function matchingKey(values: Pick<SupplyCatalogRecord, 'name' | 'category'> | ImportedValues) { return `${normalized(values.name)}|${normalized(values.category)}` }

export function previewSupplyImport(source: Array<{ rowNumber: number; values: ImportedValues }>, current: SupplyCatalogRecord[], mode: SupplyImportMode): SupplyImportRow[] {
  const byCode = new Map(current.filter(item => item.code).map(item => [normalized(item.code), item]))
  const byName = new Map(current.map(item => [matchingKey(item), item]))
  const sourceCodes = new Map<string, number>()
  return source.map(row => {
    const codeKey = row.values.code ? normalized(row.values.code) : ''
    if (codeKey) {
      const previous = sourceCodes.get(codeKey)
      if (previous) return { ...row, action: 'invalid', message: `Código repetido na linha ${previous}.` }
      sourceCodes.set(codeKey, row.rowNumber)
    }
    if (!row.values.name) return { ...row, action: 'invalid', message: 'Informe o nome do insumo ou produto.' }
    if (row.values.current_cost !== undefined && row.values.current_cost < 0) return { ...row, action: 'invalid', message: 'O custo não pode ser negativo.' }
    const existing = codeKey ? byCode.get(codeKey) : byName.get(matchingKey(row.values))
    if (!existing && !row.values.code) return { ...row, action: 'invalid', message: 'Informe o código para acrescentar um novo item.' }
    if (!existing && mode === 'update-only') return { ...row, action: 'ignore', message: 'Não existe um cadastro correspondente para atualizar.' }
    const result = {
      code: row.values.code ?? existing?.code ?? '',
      name: row.values.name ?? existing?.name ?? '',
      category: row.values.category ?? existing?.category ?? '',
      purchase_unit: row.values.purchase_unit ?? existing?.purchase_unit ?? 'un',
      usage_unit: row.values.usage_unit ?? existing?.usage_unit ?? 'un',
      current_cost: row.values.current_cost ?? existing?.current_cost ?? 0,
      active: row.values.active ?? existing?.active ?? true,
      import_details: {...existing?.import_details,...row.values.import_details},
    }
    return { ...row, action: existing ? 'update' : 'create', existingId: existing?.id, result }
  })
}
