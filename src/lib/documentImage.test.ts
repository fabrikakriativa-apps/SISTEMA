import { describe, expect, it } from 'vitest'
import { documentImageScale, DOCUMENT_IMAGE_WIDTH } from './documentImage'

describe('document image resolution', () => {
  it('exports normal documents at 2700 pixels wide', () => {
    expect(DOCUMENT_IMAGE_WIDTH * documentImageScale(900, 2400)).toBe(2700)
  })
  it('limits memory for long documents while retaining their full height', () => {
    const scale = documentImageScale(900, 12000)
    expect(12000 * scale).toBeLessThanOrEqual(16000)
    expect(900 * 12000 * scale * scale).toBeLessThanOrEqual(32000000)
  })
  it('never scales above three times', () => {
    expect(documentImageScale(900, 100)).toBe(3)
  })
})

