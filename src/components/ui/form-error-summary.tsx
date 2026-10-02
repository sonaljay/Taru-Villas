'use client'
export function FormErrorSummary({ errors }: { errors: readonly { fieldId: string; message: string }[] }) {
  if (!errors.length) return null
  return <div role="alert" className="portal-form-errors rounded-xl border border-destructive/40 bg-destructive/5 p-4">
    <p className="font-medium">Check these details before saving</p>
    <ul className="mt-2 list-inside list-disc space-y-1">{errors.map(error => <li key={error.fieldId}>
      <a className="underline underline-offset-2" href={`#${error.fieldId}`} onClick={event => {
        event.preventDefault(); document.getElementById(error.fieldId)?.focus()
      }}>{error.message}</a>
    </li>)}</ul>
  </div>
}
