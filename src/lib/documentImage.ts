import { toBlob } from 'html-to-image'

export const DOCUMENT_IMAGE_WIDTH = 900

// Keep long documents within browser canvas/memory limits without cropping.
export function documentImageScale(width: number, height: number) {
  return Math.min(3, 16000 / Math.max(width, height, 1), Math.sqrt(32000000 / Math.max(width * height, 1)))
}

export async function renderDocumentImage(node: HTMLElement): Promise<Blob> {
  await document.fonts.ready
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${DOCUMENT_IMAGE_WIDTH}px;pointer-events:none;`
  const copy = node.cloneNode(true) as HTMLElement
  // Measure a full-sized document, not the narrow modal or its scroll viewport.
  Object.assign(copy.style, {width:`${DOCUMENT_IMAGE_WIDTH}px`, maxWidth:'none', height:'auto', maxHeight:'none', overflow:'visible', boxSizing:'border-box', boxShadow:'none', margin:'0', transform:'none'})
  host.append(copy)
  document.body.append(host)
  try {
    await Promise.all(Array.from(copy.querySelectorAll('img')).map(async image => {
      if (image.decode) await image.decode().catch(() => undefined)
    }))
    const height = Math.ceil(copy.getBoundingClientRect().height)
    if (!height) throw new Error('Documento vazio')
    const blob = await toBlob(copy, {
      width: DOCUMENT_IMAGE_WIDTH, height,
      pixelRatio: documentImageScale(DOCUMENT_IMAGE_WIDTH, height),
      backgroundColor:'#ffffff', cacheBust:true,
    })
    if (!blob) throw new Error('Imagem não gerada')
    return blob
  } finally {
    host.remove()
  }
}

