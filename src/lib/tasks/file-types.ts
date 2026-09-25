import { inflateRawSync } from 'node:zlib'
export function validateAttachment(name: string, bytes: Buffer): string {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024)
    throw Error('Files must be nonempty and at most 10 MB.')
  const ext = name.split('.').pop()?.toLowerCase()
  const fail = () => {
    throw Error('Choose a valid JPEG, PNG, WebP, PDF, DOCX or XLSX file.')
  }
  if (
    ext === 'pdf' &&
    bytes.subarray(0, 5).toString() === '%PDF-' &&
    bytes.subarray(-1024).includes(Buffer.from('%%EOF'))
  )
    return 'application/pdf'
  if (
    ['jpg', 'jpeg'].includes(ext ?? '') &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return 'image/jpeg'
  if (
    ext === 'png' &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png'
  if (
    ext === 'webp' &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  )
    return 'image/webp'
  if (ext === 'docx' || ext === 'xlsx') {
    // Read bounded central-directory entries, not arbitrary ZIP contents.
    let eocd = -1
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
      if (bytes.readUInt32LE(i) === 0x06054b50) {
        eocd = i
        break
      }
    if (eocd < 0) return fail()
    const count = bytes.readUInt16LE(eocd + 10)
    let pos = bytes.readUInt32LE(eocd + 16)
    const names = new Set<string>()
    let content = ''
    if (count > 2000) return fail()
    for (let i = 0; i < count; i++) {
      if (pos + 46 > bytes.length || bytes.readUInt32LE(pos) !== 0x02014b50)
        return fail()
      const flags = bytes.readUInt16LE(pos + 8),
        method = bytes.readUInt16LE(pos + 10),
        size = bytes.readUInt32LE(pos + 20),
        expanded = bytes.readUInt32LE(pos + 24),
        len = bytes.readUInt16LE(pos + 28),
        extra = bytes.readUInt16LE(pos + 30),
        comment = bytes.readUInt16LE(pos + 32),
        offset = bytes.readUInt32LE(pos + 42)
      const entry = bytes.subarray(pos + 46, pos + 46 + len).toString()
      names.add(entry)
      if (
        flags & 1 ||
        entry.includes('..') ||
        entry.toLowerCase().includes('vbaproject')
      )
        return fail()
      if (entry === '[Content_Types].xml') {
        if (
          expanded > 1048576 ||
          offset + 30 > bytes.length ||
          bytes.readUInt32LE(offset) !== 0x04034b50
        )
          return fail()
        const start =
          offset +
          30 +
          bytes.readUInt16LE(offset + 26) +
          bytes.readUInt16LE(offset + 28)
        if (start + size > bytes.length) return fail()
        const compressed = bytes.subarray(start, start + size)
        try {
          content = (
            method === 0
              ? compressed
              : method === 8
                ? inflateRawSync(compressed, { maxOutputLength: 1048576 })
                : Buffer.alloc(0)
          ).toString()
        } catch {
          return fail()
        }
      }
      pos += 46 + len + extra + comment
    }
    const main = ext === 'docx' ? 'word/document.xml' : 'xl/workbook.xml'
    const mime =
      ext === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    if (
      names.has(main) &&
      content.includes(
        ext === 'docx'
          ? 'wordprocessingml.document.main+xml'
          : 'spreadsheetml.sheet.main+xml',
      )
    )
      return mime
  }
  return fail()
}
