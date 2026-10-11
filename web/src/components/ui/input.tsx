import * as React from 'react'

import { cn } from '@/lib/utils'

const fieldBase =
  'w-full min-w-0 rounded-2xl border border-input bg-card px-4 text-base shadow-xs transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm'
const fieldFocus = 'focus-visible:border-foreground/60 focus-visible:ring-[3px] focus-visible:ring-ring/15'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldBase,
        fieldFocus,
        'flex h-12 py-2 file:mr-3 file:inline-flex file:h-8 file:rounded-full file:border-0 file:bg-muted file:px-3 file:text-sm file:font-semibold',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldBase, fieldFocus, 'flex min-h-24 py-3', 'aria-invalid:border-destructive aria-invalid:ring-destructive/20', className)}
      {...props}
    />
  )
}

/** A styled native select: native pickers work best on phones. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        fieldBase,
        fieldFocus,
        'flex h-12 appearance-none bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat py-2 pr-10',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888780' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export { Input, NativeSelect, Textarea }
