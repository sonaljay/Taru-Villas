import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Field } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

it('connects generated field labels to their input without duplicate IDs', () => {
  const markup = renderToStaticMarkup(createElement('div', null,
    ...['First', 'Second'].map(label => createElement(Field, { key: label },
      createElement(Label, null, label), createElement(Input, { name: label }))),
  ))
  const labels = [...markup.matchAll(/for="([^"]+)"/g)].map(match => match[1])
  const inputs = [...markup.matchAll(/<input[^>]*id="([^"]+)"/g)].map(match => match[1])
  expect(labels).toHaveLength(2)
  expect(inputs).toEqual(labels)
  expect(new Set(inputs).size).toBe(2)
})
it('preserves explicit control IDs and unscoped controls', () => {
  const markup = renderToStaticMarkup(createElement(Field, { controlId: 'property-name' },
    createElement(Label, null, 'Property'), createElement(Input, { id: 'property-name' })))
  expect(markup).toContain('for="property-name"')
  expect(markup).toContain('id="property-name"')
  expect(renderToStaticMarkup(createElement(Input, { name: 'public' }))).not.toMatch(/id="/)
})
