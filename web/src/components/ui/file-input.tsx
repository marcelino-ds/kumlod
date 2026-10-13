import { FileIcon, UploadCloudIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { buttonVariants } from '@/components/ui/button'
import { cn, formatBytes } from '@/lib/utils'

/**
 * Drop zone for one file. The real file input is visually hidden; it still
 * takes focus and opens the system file chooser.
 */
export function FileInput({
  id,
  file,
  onFileChange,
  accept,
  disabled,
  ...aria
}: {
  id: string
  file: File | null
  onFileChange: (file: File | null) => void
  accept?: string
  disabled?: boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)

  const clear = () => {
    onFileChange(null)
    if (inputRef.current) inputRef.current.value = ''
    inputRef.current?.focus()
  }

  return (
    <div
      onDragOver={(e) => {
        if (disabled) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const dropped = e.dataTransfer.files[0]
        if (!disabled && dropped) onFileChange(dropped)
      }}
      className={cn(
        'relative rounded-2xl border-2 border-dashed border-input bg-card transition-colors focus-within:border-foreground/60 focus-within:ring-[3px] focus-within:ring-ring/15',
        dragging && 'border-foreground/60 bg-muted',
        aria['aria-invalid'] && 'border-destructive',
        file && 'border-solid',
        disabled && 'opacity-50',
      )}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        className="sr-only"
        {...aria}
      />
      {file ? (
        <div className="flex items-center gap-3 p-3">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground">
            <FileIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{file.name}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{formatBytes(file.size)}</p>
          </div>
          <label htmlFor={id} className={cn(buttonVariants({ variant: 'outline' }), 'cursor-pointer px-4')}>
            Ganti
          </label>
          <button
            type="button"
            onClick={clear}
            aria-label="Hapus file pilihan"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <XIcon className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <label htmlFor={id} className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1.5 px-4 py-5 text-center">
          <span aria-hidden className="mb-1 flex size-12 rotate-[-6deg] items-center justify-center rounded-2xl bg-brand text-brand-foreground shadow-sm">
            <UploadCloudIcon className="size-6" />
          </span>
          <span className="text-sm font-bold">{dragging ? 'Lepas untuk upload' : 'Pilih file'}</span>
          <span className="text-xs text-muted-foreground">atau tarik file ke sini</span>
        </label>
      )}
    </div>
  )
}
