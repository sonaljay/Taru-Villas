import { it, expect } from 'vitest'
import { validateAttachment } from './file-types'
it('rejects disguised files and excess size', () => {
  expect(() =>
    validateAttachment('image.png', Buffer.from('<script>hello</script>')),
  ).toThrow()
  expect(() => validateAttachment('large.pdf', Buffer.alloc(10485761))).toThrow(
    /10 MB/,
  )
  expect(() =>
    validateAttachment('macro.exe', Buffer.from('%PDF-1.7')),
  ).toThrow()
})
it('accepts a PDF signature only with a matching extension', () => {
  expect(validateAttachment('report.pdf', Buffer.from('%PDF-1.7\n%%EOF'))).toBe(
    'application/pdf',
  )
  expect(() =>
    validateAttachment('report.jpg', Buffer.from('%PDF-1.7\n%%EOF')),
  ).toThrow()
})
it('rejects arbitrary zip files posing as office documents', () =>
  expect(() =>
    validateAttachment(
      'fake.docx',
      Buffer.from('PK\u0003\u0004not an office document'),
    ),
  ).toThrow())
