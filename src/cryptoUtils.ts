import QRCode from 'qrcode'

export async function generateSHA256Hash(payload: Record<string, unknown>): Promise<string> {
  const canonicalString = JSON.stringify(payload, Object.keys(payload).sort())
  const msgUint8 = new TextEncoder().encode(canonicalString)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
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
