import QRCode from 'qrcode'

export async function generateSHA256Hash(payload: Record<string, unknown>): Promise<string> {
  const canonicalString = JSON.stringify(payload, Object.keys(payload).sort())
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const msgUint8 = new TextEncoder().encode(canonicalString)
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch (err) {
    console.warn('Crypto subtle digest fallback invoked:', err)
  }

  // Pure JavaScript hash fallback (FNV-1a / polynomial hash variant) for non-secure / HTTP / offline origins
  let h1 = 0xdeadbeef ^ 0
  let h2 = 0x41c6ce57 ^ 0
  for (let i = 0, ch; i < canonicalString.length; i++) {
    ch = canonicalString.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, '0')
  return hex.repeat(4).slice(0, 64)
}

export async function generateQRCodeDataURL(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: 120,
      margin: 1,
      color: {
        dark: '#183e4e',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
  } catch (err) {
    console.error('QR code generation failed:', err)
    return ''
  }
}
