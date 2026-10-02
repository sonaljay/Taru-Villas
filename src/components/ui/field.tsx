'use client'
import * as React from 'react'
const FieldContext = React.createContext<string | undefined>(undefined)
/** Associates a single label and control, including fields rendered in lists. */
export function Field({ controlId, children, ...props }: React.ComponentProps<'div'> & { controlId?: string }) {
  const generatedId = React.useId()
  return <FieldContext.Provider value={controlId ?? generatedId}><div {...props}>{children}</div></FieldContext.Provider>
}
export function useFieldControlId() { return React.useContext(FieldContext) }

export function FieldInput({ id, ...props }: React.ComponentProps<'input'>) {
  const fieldId = useFieldControlId()
  return <input id={id ?? fieldId} {...props} />
}
export function FieldSelect({ id, ...props }: React.ComponentProps<'select'>) {
  const fieldId = useFieldControlId()
  return <select id={id ?? fieldId} {...props} />
}
export function FieldTextarea({ id, ...props }: React.ComponentProps<'textarea'>) {
  const fieldId = useFieldControlId()
  return <textarea id={id ?? fieldId} {...props} />
}
