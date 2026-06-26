'use client'

import { useRef, useState } from 'react'
import { Upload, Download, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { buildTemplate, parseCsv, type ImportType } from '@/lib/utilities/csv'

interface PreviewResult {
  total: number
  newCount: number
  overwriteCount: number
  errorCount: number
  errors: { row: number; message: string }[]
  committed: boolean
  imported: number
}

const TYPE_LABEL: Record<ImportType, string> = {
  electricity: 'Electricity readings',
  water: 'Water readings',
  wastage: 'Daily wastage',
}

export function BulkImportCard({
  type,
  propertyId,
  onSuccess,
}: {
  type: ImportType
  propertyId: string
  onSuccess?: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [busy, setBusy] = useState(false)

  const endpoint = type === 'wastage' ? '/api/waste/bulk-import' : '/api/utilities/bulk-import'

  function buildBody(parsedRows: Record<string, string>[], dryRun: boolean) {
    return type === 'wastage'
      ? { propertyId, dryRun, rows: parsedRows }
      : { propertyId, utilityType: type, dryRun, rows: parsedRows }
  }

  function downloadTemplate() {
    const blob = new Blob([buildTemplate(type)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}-import-template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setPreview(null)
    try {
      const text = await file.text()
      const { rows: parsedRows } = parseCsv(text)
      if (parsedRows.length === 0) {
        toast.error('That file has no data rows')
        setRows([])
        return
      }
      setRows(parsedRows)
      setBusy(true)
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(parsedRows, true)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Preview failed')
      setPreview(data as PreviewResult)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read file')
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport() {
    setBusy(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(rows, false)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      toast.success(`Imported ${data.imported} rows (${data.newCount} new, ${data.overwriteCount} updated)`)
      reset()
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setRows([])
    setFileName(null)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const canConfirm = !!preview && preview.errorCount === 0 && rows.length > 0 && !busy

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="size-4" />
          Bulk Import — {TYPE_LABEL[type]}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload a CSV to backfill historical data. Download the template for the exact columns.
          Existing dates are overwritten. Review the preview before confirming.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="size-4" />
            Download template
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="size-4" />
            {fileName ?? 'Choose CSV'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        {preview && (
          <div className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <span><strong>{preview.total}</strong> rows</span>
              <span className="text-emerald-600"><strong>{preview.newCount}</strong> new</span>
              <span className="text-amber-600"><strong>{preview.overwriteCount}</strong> overwrite</span>
              <span className={preview.errorCount > 0 ? 'text-red-600' : 'text-muted-foreground'}>
                <strong>{preview.errorCount}</strong> errors
              </span>
            </div>

            {preview.errorCount > 0 && (
              <div className="max-h-48 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Row</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.errors.map((e, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{e.row}</TableCell>
                        <TableCell className="text-red-600">{e.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={confirmImport} disabled={!canConfirm}>
                {busy ? 'Importing…' : 'Confirm import'}
              </Button>
              <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>
                Cancel
              </Button>
              {preview.errorCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  Fix the errors and re-select the file to enable import.
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
