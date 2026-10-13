import { CheckIcon, ChevronDownIcon, ChevronUpIcon, SearchIcon } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'
import * as React from 'react'

import { fieldTrigger } from '@/components/ui/input'
import { panelClass, Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type SelectOption = {
  value: string
  label: string
  /** Second line in the list only, e.g. a date or a note. */
  hint?: string
  /** Color dot, e.g. a course color. */
  color?: string
  disabled?: boolean
}

type FieldAria = {
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'aria-label'?: string
}

// Radix Select reserves "" for "no value", so empty options get a stand-in.
const EMPTY = '__kumlod_empty__'
const toItem = (v: string) => (v === '' ? EMPTY : v)
const fromItem = (v: string) => (v === EMPTY ? '' : v)

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
}

const itemClass =
  'relative flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl py-2 pr-9 pl-3 text-sm font-medium outline-none select-none ' +
  'data-[highlighted]:bg-muted data-[state=checked]:font-bold data-[disabled]:pointer-events-none data-[disabled]:opacity-50'

const scrollButtonClass = 'flex h-7 cursor-default items-center justify-center text-muted-foreground'

/** Dropdown list styled like the rest of the app (replaces the native select). */
function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Pilih',
  disabled,
  className,
  ...aria
}: FieldAria & {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const selected = options.find((o) => o.value === value)
  // Radix reports "" when the value is not among the items yet (options still
  // loading). Real items never produce "" (empty options use EMPTY), so ignore
  // it instead of clearing the saved value.
  const onChange = (v: string) => {
    if (v !== '') onValueChange(fromItem(v))
  }
  return (
    <SelectPrimitive.Root value={selected ? toItem(value) : ''} onValueChange={onChange} disabled={disabled}>
      <SelectPrimitive.Trigger data-slot="select" className={cn(fieldTrigger, 'group data-[placeholder]:text-muted-foreground', className)} {...aria}>
        {selected?.color && <Dot color={selected.color} />}
        <span className="min-w-0 flex-1 truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDownIcon aria-hidden className="size-4 shrink-0 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            panelClass,
            'relative max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-48 origin-(--radix-select-content-transform-origin) overflow-hidden',
          )}
        >
          <SelectPrimitive.ScrollUpButton className={scrollButtonClass}>
            <ChevronUpIcon className="size-4" aria-hidden />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="w-full min-w-(--radix-select-trigger-width) p-1.5">
            {options.map((o) => (
              <SelectPrimitive.Item key={o.value || EMPTY} value={toItem(o.value)} disabled={o.disabled} textValue={o.label} className={itemClass}>
                {o.color && <Dot color={o.color} />}
                <span className="min-w-0 flex-1">
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  {o.hint && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{o.hint}</span>}
                </span>
                <SelectPrimitive.ItemIndicator className="absolute right-3 flex items-center">
                  <CheckIcon className="size-4" strokeWidth={3} aria-hidden />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className={scrollButtonClass}>
            <ChevronDownIcon className="size-4" aria-hidden />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

/** Select with a search box, for long lists such as time zones. */
function Combobox({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'Pilih',
  searchLabel = 'Cari',
  emptyText = 'Tidak ada yang cocok',
  disabled,
  className,
  ...aria
}: FieldAria & {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  searchLabel?: string
  emptyText?: string
  disabled?: boolean
  className?: string
}) {
  const fallbackId = React.useId()
  const baseId = id ?? fallbackId
  const listId = `${baseId}-list`
  const optionId = (i: number) => `${baseId}-opt-${i}`
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [active, setActive] = React.useState(0)
  const selected = options.find((o) => o.value === value)

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ')
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.value} ${o.hint ?? ''}`.toLowerCase().replace(/_/g, ' ').includes(q))
  }, [options, query])

  // Keep the highlighted option visible.
  React.useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => document.getElementById(`${baseId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' }))
    return () => cancelAnimationFrame(frame)
  }, [active, open, baseId])

  const onOpenChange = (o: boolean) => {
    setOpen(o)
    if (o) {
      setQuery('')
      setActive(Math.max(options.findIndex((x) => x.value === value), 0))
    }
  }

  const choose = (o: SelectOption | undefined) => {
    if (!o || o.disabled) return
    onValueChange(o.value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const last = filtered.length - 1
    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, last))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
    else if (e.key === 'PageDown') setActive((i) => Math.min(i + 8, last))
    else if (e.key === 'PageUp') setActive((i) => Math.max(i - 8, 0))
    else if (e.key === 'Enter') choose(filtered[active])
    else return
    e.preventDefault()
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          className={cn(fieldTrigger, 'group', !selected && 'text-muted-foreground', className)}
          aria-invalid={aria['aria-invalid']}
          aria-label={aria['aria-label']}
          aria-describedby={[`${baseId}-value`, aria['aria-describedby']].filter(Boolean).join(' ')}
        >
          {selected?.color && <Dot color={selected.color} />}
          <span id={`${baseId}-value`} className="min-w-0 flex-1 truncate">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDownIcon aria-hidden className="size-4 shrink-0 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 overflow-hidden p-0">
        <div className="relative border-b">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            role="combobox"
            aria-label={searchLabel}
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={filtered.length > 0 ? optionId(active) : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={searchLabel}
            className="h-12 w-full bg-transparent pr-4 pl-10 text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
        </div>
        <ul id={listId} role="listbox" aria-label={aria['aria-label'] ?? placeholder} className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</li>}
          {filtered.map((o, i) => {
            const isSelected = o.value === value
            return (
              <li
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                data-highlighted={i === active ? '' : undefined}
                onPointerMove={() => i !== active && setActive(i)}
                onClick={() => choose(o)}
                className={cn(itemClass, isSelected && 'font-bold', o.disabled && 'pointer-events-none opacity-50')}
              >
                {o.color && <Dot color={o.color} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{o.hint}</span>}
                </span>
                {isSelected && <CheckIcon className="absolute right-3 size-4" strokeWidth={3} aria-hidden />}
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export { Combobox, Select }
