import { XIcon } from 'lucide-react'
import { AlertDialog as AlertDialogPrimitive, Dialog as DialogPrimitive } from 'radix-ui'
import * as React from 'react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

const overlayClass =
  'fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

// On phones the dialog is a bottom sheet; from sm up it is centered.
const contentClass =
  'fixed z-50 grid max-h-[92dvh] w-full gap-5 overflow-y-auto bg-popover p-6 pt-7 text-popover-foreground shadow-2xl duration-200 ' +
  'inset-x-0 bottom-0 rounded-t-[2rem] pb-[calc(1.5rem+env(safe-area-inset-bottom))] ' +
  'before:absolute before:top-2.5 before:left-1/2 before:h-1.5 before:w-10 before:-translate-x-1/2 before:rounded-full before:bg-foreground/15 sm:before:hidden ' +
  'sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[2rem] sm:pb-6 sm:pt-6 ' +
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ' +
  'data-[state=closed]:slide-out-to-bottom-8 data-[state=open]:slide-in-from-bottom-8 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0'

function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content data-slot="dialog-content" className={cn(contentClass, className)} {...props}>
        {children}
        {showClose && (
          <DialogPrimitive.Close className="absolute top-4 right-4 inline-flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40">
            <XIcon className="size-5" />
            <span className="sr-only">Tutup</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pr-12', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end', className)} {...props} />
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-xl leading-tight font-extrabold tracking-tight', className)} {...props} />
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
}

/** A confirmation dialog for destructive actions. */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Hapus',
  onConfirm,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel?: string
  onConfirm: () => void
  pending?: boolean
}) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={overlayClass} />
        <AlertDialogPrimitive.Content className={contentClass}>
          <div className="flex flex-col gap-1.5">
            <AlertDialogPrimitive.Title className="text-xl font-extrabold tracking-tight">{title}</AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="text-sm text-muted-foreground">
              {description}
            </AlertDialogPrimitive.Description>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel className={buttonVariants({ variant: 'outline' })}>Batal</AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              className={buttonVariants({ variant: 'destructive' })}
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                onConfirm()
              }}
            >
              {confirmLabel}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}

export {
  ConfirmDialog,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
}
