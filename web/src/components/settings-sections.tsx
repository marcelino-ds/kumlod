import { useQuery } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import {
  BellIcon,
  BellOffIcon,
  BellRingIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  GraduationCapIcon,
  InfoIcon,
  KeyRoundIcon,
  LaptopIcon,
  LogOutIcon,
  PlusIcon,
  SendIcon,
  ShieldAlertIcon,
  SlidersHorizontalIcon,
  SmartphoneIcon,
  Trash2Icon,
  UserCheckIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type * as React from 'react'
import { toast } from 'sonner'

import { errorMessage, type Settings } from '@/api/client'
import { meQuery, pushKeyQuery, useChangePassword, useLogout, useSubscribePush, useTestPush, useUnsubscribePush } from '@/api/queries'
import { AppearancePicker } from '@/components/AppearanceControl'
import { Field, FormError, invalidProps } from '@/components/common'
import { SaveBar, SettingsSection, Stepper, ToggleRow, useAutoSave, useDirty, useSettingsCtx } from '@/components/settings-kit'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { localTime, timeZones } from '@/lib/dates'
import { fieldErrors, useNow } from '@/lib/hooks'
import { gradeScalePresets, type GradeScaleEntry } from '@/lib/labels'
import { currentSubscription, isIOS, isStandalone, pushSupported, subscribeDevice, unsubscribeDevice } from '@/lib/push'
import {
  absenceAllowance,
  deviceTimeZone,
  matchPreset,
  parseDecimal,
  rowsToScale,
  scaleBands,
  scaleChanged,
  scaleIssues,
  timeZoneShort,
  type ScaleRow,
} from '@/lib/settings'
import { uuidv7 } from '@/lib/uuid'
import { cn, formatNumber } from '@/lib/utils'

// ================================================================ push

export type PushState = 'loading' | 'unsupported' | 'ios-browser' | 'no-sw' | 'denied' | 'off' | 'on'

/** Push status of this device plus enable and disable actions. */
export function usePushDevice() {
  const key = useQuery(pushKeyQuery)
  const subscribe = useSubscribePush()
  const unsubscribe = useUnsubscribePush()
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (isIOS() && !isStandalone()) return setState('ios-browser')
    if (!pushSupported()) return setState('unsupported')
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return setState('no-sw')
    if (Notification.permission === 'denied') return setState('denied')
    setState((await currentSubscription()) ? 'on' : 'off')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const enable = () =>
    run(async () => {
      if (!key.data) throw new Error('Kunci notifikasi belum dimuat. Coba lagi sebentar.')
      await subscribe.mutateAsync(await subscribeDevice(key.data))
      toast.success('Notifikasi aktif di perangkat ini')
    })

  const disable = () =>
    run(async () => {
      const endpoint = await unsubscribeDevice()
      if (endpoint) await unsubscribe.mutateAsync(endpoint)
      toast.success('Notifikasi dimatikan di perangkat ini')
    })

  return { state, busy, ready: !!key.data, enable, disable }
}

export type PushDevice = ReturnType<typeof usePushDevice>

/** Short status for the page header. */
export const pushStateLabel: Record<PushState, string> = {
  loading: 'Memeriksa',
  unsupported: 'Tidak didukung',
  'ios-browser': 'Perlu Home Screen',
  'no-sw': 'Belum siap',
  denied: 'Diblokir',
  off: 'Belum aktif',
  on: 'Aktif',
}

export const pushNeedsAttention = (s: PushState) => s === 'off' || s === 'denied' || s === 'ios-browser'

function DeviceStatus({ push }: { push: PushDevice }) {
  const test = useTestPush()
  const sendTest = () =>
    test.mutate(undefined, {
      onSuccess: (r) => {
        if (r.sent + r.failed === 0) toast.error('Belum ada perangkat yang mengaktifkan notifikasi')
        else if (r.failed === 0) toast.success(`Notifikasi uji terkirim ke ${r.sent} perangkat`)
        else toast.warning(`Terkirim ke ${r.sent} perangkat, gagal ke ${r.failed}`)
      },
    })

  const { state } = push
  const tone =
    state === 'on'
      ? 'bg-emerald-500/10 ring-emerald-500/40'
      : state === 'off'
        ? 'bg-brand/15 ring-brand/50 dark:bg-brand/10'
        : state === 'denied'
          ? 'bg-destructive/10 ring-destructive/40'
          : 'bg-muted ring-transparent'
  const Icon = state === 'on' ? BellRingIcon : state === 'denied' ? ShieldAlertIcon : state === 'off' ? BellIcon : BellOffIcon
  const title = {
    loading: 'Memeriksa perangkat ini...',
    on: 'Aktif di perangkat ini',
    off: 'Belum aktif di perangkat ini',
    denied: 'Izin notifikasi diblokir',
    'ios-browser': 'Di iPhone, buka Kumlod dari Home Screen dulu',
    unsupported: 'Browser ini belum mendukung notifikasi',
    'no-sw': 'Service worker belum aktif',
  }[state]
  const body: React.ReactNode = {
    loading: null,
    on: 'Reminder dan ringkasan dikirim ke perangkat ini walau Kumlod sedang ditutup.',
    off: 'Aktifkan supaya reminder sampai walau Kumlod tidak dibuka. Lakukan di tiap HP dan laptop.',
    denied:
      'Buka pengaturan situs di browser (ikon gembok di address bar) atau pengaturan aplikasi di HP, izinkan notifikasi, lalu muat ulang halaman.',
    'ios-browser': (
      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
        <li>Di Safari, tap tombol Share (kotak dengan panah ke atas).</li>
        <li>Pilih Add to Home Screen, lalu Add.</li>
        <li>Buka Kumlod dari ikon di Home Screen, lalu kembali ke halaman ini.</li>
      </ol>
    ),
    unsupported: 'Coba Chrome di Android, Safari iOS 16.4 ke atas dari Home Screen, atau Chrome/Edge di laptop.',
    'no-sw': 'Muat ulang halaman. Kalau sedang development, pakai versi build (bukan dev server).',
  }[state]

  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl p-4 ring-1 @lg:flex-row @lg:items-center', tone)} aria-live="polite">
      <div className="flex min-w-0 flex-1 gap-3">
        <span
          aria-hidden
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full',
            state === 'on' ? 'bg-emerald-500 text-white' : state === 'off' ? 'bg-brand text-brand-foreground' : 'bg-card',
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-bold">{title}</p>
          {body && <div className="mt-0.5 text-muted-foreground">{body}</div>}
        </div>
      </div>
      {state === 'off' && (
        <Button onClick={() => void push.enable()} disabled={push.busy || !push.ready} className="shrink-0">
          <BellIcon /> {push.busy ? 'Mengaktifkan...' : 'Aktifkan'}
        </Button>
      )}
      {state === 'on' && (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" onClick={sendTest} disabled={test.isPending}>
            <SendIcon /> {test.isPending ? 'Mengirim...' : 'Kirim uji'}
          </Button>
          <Button variant="ghost" onClick={() => void push.disable()} disabled={push.busy}>
            <BellOffIcon /> Matikan
          </Button>
        </div>
      )}
    </div>
  )
}

function DigestTime({ value }: { value: string }) {
  const { save } = useSettingsCtx()
  const [time, setTime] = useState(value)
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  const saving = useAutoSave(time, value, valid, (t) =>
    save((cur) => ({ reminders: { ...cur.reminders, digest_time: t } }), { success: `Ringkasan dikirim jam ${t}` }),
  )
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-foreground/10 pt-3">
      <Label htmlFor="r-digest-time" className="font-medium text-muted-foreground">
        Dikirim jam
      </Label>
      <Input id="r-digest-time" type="time" className="h-11 w-36" value={time} onChange={(e) => setTime(e.target.value)} aria-invalid={!valid || undefined} />
      {saving && <span className="text-xs text-muted-foreground">Menyimpan...</span>}
    </div>
  )
}

export function NotificationsSection({ settings: s, push }: { settings: Settings; push: PushDevice }) {
  const { save } = useSettingsCtx()
  const r = s.reminders
  const setReminder = (patch: Partial<Settings['reminders']>, msg: string) =>
    save((cur) => ({ reminders: { ...cur.reminders, ...patch } }), { success: msg })
  const offHere = push.state !== 'on' && push.state !== 'loading'

  return (
    <SettingsSection
      id="notifikasi"
      icon={BellRingIcon}
      tone="bg-brand text-brand-foreground"
      title="Notifikasi"
      description="Kumlod yang ngingetin kamu: deadline tugas, absen, dan ringkasan pagi."
    >
      <DeviceStatus push={push} />

      <div className="mt-5 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold">Yang dikirim</h3>
        <p className="text-xs text-muted-foreground">Berlaku di semua perangkat yang aktif</p>
      </div>
      <div className="mt-2 grid gap-2">
        <ToggleRow
          id="r-task"
          label="Reminder deadline tugas"
          hint="3 hari, 24 jam, dan 3 jam sebelum deadline. Berhenti setelah tugas dicentang."
          checked={r.task_enabled}
          onSave={(v) => setReminder({ task_enabled: v }, v ? 'Reminder tugas dinyalakan' : 'Reminder tugas dimatikan')}
        />
        <ToggleRow
          id="r-att"
          label="Pengingat absen"
          hint="15 menit setelah kuliah mulai kalau absen belum dicatat."
          checked={r.attendance_enabled}
          onSave={(v) => setReminder({ attendance_enabled: v }, v ? 'Pengingat absen dinyalakan' : 'Pengingat absen dimatikan')}
        />
        <ToggleRow
          id="r-digest"
          label="Ringkasan pagi"
          hint="Kuliah hari ini dan deadline 48 jam ke depan."
          checked={r.digest_enabled}
          onSave={(v) => setReminder({ digest_enabled: v }, v ? 'Ringkasan pagi dinyalakan' : 'Ringkasan pagi dimatikan')}
        >
          <DigestTime key={r.digest_time} value={r.digest_time} />
        </ToggleRow>
      </div>
      {offHere && (r.task_enabled || r.attendance_enabled || r.digest_enabled) && (
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          Perangkat ini belum menerima notifikasi. Pengaturan di atas tetap berlaku untuk perangkat lain yang sudah aktif.
        </p>
      )}
    </SettingsSection>
  )
}

// ============================================================== grades

const toRows = (scale: GradeScaleEntry[]): ScaleRow[] =>
  scale.map((e) => ({ key: uuidv7(), letter: e.letter, min: String(e.min_score).replace('.', ','), points: String(e.points).replace('.', ',') }))

/** Hue from red (0 points) to green (4 points). */
const bandColor = (points: number) => `hsl(${Math.round((Math.min(Math.max(points, 0), 4) / 4) * 125)} 65% 48%)`

function ScalePreview({ rows }: { rows: ScaleRow[] }) {
  const bands = scaleBands(rows)
  if (bands.length === 0) return null
  return (
    <figure className="grid gap-1.5">
      <div aria-hidden className="flex h-9 gap-0.5 overflow-hidden rounded-xl">
        {bands.map((b) => (
          <span
            key={`${b.letter}-${b.from}`}
            className="flex min-w-0 items-center justify-center overflow-hidden text-xs font-extrabold text-white"
            style={{ width: `${Math.max(b.to - b.from, 0)}%`, backgroundColor: bandColor(b.points) }}
            title={`${b.letter}: ${formatNumber(b.from)}-${formatNumber(b.to)}`}
          >
            {b.to - b.from >= 4 ? b.letter : ''}
          </span>
        ))}
      </div>
      <figcaption className="flex justify-between text-[0.7rem] font-semibold text-muted-foreground tabular-nums">
        <span>0</span>
        <span className="sr-only">
          {bands
            .slice()
            .reverse()
            .map((b) => `${b.letter} mulai ${formatNumber(b.from)}`)
            .join(', ')}
        </span>
        <span>100</span>
      </figcaption>
    </figure>
  )
}

function ScaleEditor({ settings: s }: { settings: Settings }) {
  const { save } = useSettingsCtx()
  const [rows, setRows] = useState<ScaleRow[]>(() => toRows(s.grade_scale))
  const [attempted, setAttempted] = useState(false)
  const [pending, setPending] = useState(false)
  const [serverError, setServerError] = useState<unknown>(null)

  const dirty = scaleChanged(rows, s.grade_scale)
  useDirty('grade-scale', dirty)
  const issues = scaleIssues(rows)
  const hasIssues = issues.general.length > 0 || Object.keys(issues.rows).length > 0
  const preset = hasIssues ? undefined : matchPreset(rowsToScale(rows))
  const serverFields = fieldErrors(serverError)

  const setRow = (key: string, patch: Partial<ScaleRow>) => setRows((l) => l.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const reset = () => {
    setRows(toRows(s.grade_scale))
    setAttempted(false)
    setServerError(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAttempted(true)
    if (hasIssues) return
    setPending(true)
    setServerError(null)
    try {
      await save({ grade_scale: rowsToScale(rows) }, { confirmGradeScale: true, success: 'Skala nilai disimpan', quietError: true })
    } catch (err) {
      setServerError(err)
    } finally {
      setPending(false)
    }
  }

  const confirm = () =>
    void save({}, { confirmGradeScale: true, success: 'Skala nilai dikonfirmasi' }).catch(() => undefined)

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      {!s.grade_scale_confirmed && !dirty && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-sky-100 p-4 text-sky-950 @lg:flex-row @lg:items-center dark:bg-sky-950 dark:text-sky-100">
          <InfoIcon className="hidden size-5 shrink-0 @lg:block" aria-hidden />
          <p className="flex-1 text-sm">
            <span className="font-bold">Skala ini masih bawaan.</span> Cocokkan dengan KHS atau pedoman akademik kampus. Kalau sudah sama, konfirmasi
            saja.
          </p>
          <Button type="button" variant="outline" className="shrink-0" onClick={confirm}>
            <CheckCircle2Icon /> Sudah sesuai
          </Button>
        </div>
      )}

      <div className="mb-5">
        <ScalePreview rows={rows} />
      </div>

      <div className="grid gap-5 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] @3xl:items-start">
        <div className="grid gap-4 @3xl:col-start-2 @3xl:row-start-1">
          <div role="group" aria-label="Preset skala nilai" className="grid grid-cols-1 gap-2 @md:grid-cols-3 @3xl:grid-cols-1">
            {gradeScalePresets.map((p) => {
              const on = preset === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setRows(toRows(p.scale))}
                  className={cn(
                    'min-w-0 rounded-2xl px-3 py-2.5 text-left ring-1 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 @md:px-4',
                    on ? 'bg-primary text-primary-foreground ring-transparent' : 'bg-card ring-foreground/10 hover:bg-muted',
                  )}
                >
                  <span className="block truncate text-sm font-bold">{p.label.split(' (')[0]}</span>
                  <span className={cn('block truncate text-xs', on ? 'opacity-75' : 'text-muted-foreground')}>{p.scale.map((e) => e.letter).join(' ')}</span>
                </button>
              )
            })}
            <div
              className={cn(
                'min-w-0 rounded-2xl px-3 py-2.5 @md:px-4',
                preset === undefined ? 'bg-primary text-primary-foreground' : 'border border-dashed border-foreground/20 text-muted-foreground',
              )}
            >
              <span className="block truncate text-sm font-bold">Custom{preset === undefined && <span className="sr-only"> (dipakai)</span>}</span>
              <span className={cn('block truncate text-xs', preset === undefined ? 'opacity-75' : '')}>
                {preset === undefined ? 'Skala kamu sendiri' : 'Ubah baris tabel'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-1.5 @3xl:col-start-1 @3xl:row-start-1">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.75rem] gap-2 px-1 text-xs font-bold text-muted-foreground" aria-hidden>
            <span>Huruf</span>
            <span>Nilai minimal</span>
            <span>Bobot (0-4)</span>
            <span />
          </div>
          {rows.map((r, i) => {
            const own = issues.rows[r.key] ?? {}
            const show = (field: 'letter' | 'min' | 'points', raw: string) => (attempted || raw.trim() !== '' ? own[field] : undefined)
            const err = {
              letter: show('letter', r.letter) ?? serverFields[`grade_scale[${i}].letter`],
              min: show('min', r.min) ?? serverFields[`grade_scale[${i}].min_score`],
              points: show('points', r.points) ?? serverFields[`grade_scale[${i}].points`],
            }
            const message = [err.letter, err.min, err.points].filter(Boolean).join(' · ')
            const name = r.letter.trim() || `baris ${i + 1}`
            return (
              <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-center gap-2">
                <Input aria-label={`Huruf baris ${i + 1}`} maxLength={3} className="h-11 font-bold" value={r.letter} onChange={(e) => setRow(r.key, { letter: e.target.value })} aria-invalid={!!err.letter || undefined} />
                <Input aria-label={`Nilai minimal ${name}`} inputMode="decimal" className="h-11 tabular-nums" value={r.min} onChange={(e) => setRow(r.key, { min: e.target.value })} aria-invalid={!!err.min || undefined} />
                <Input aria-label={`Bobot ${name}`} inputMode="decimal" className="h-11 tabular-nums" value={r.points} onChange={(e) => setRow(r.key, { points: e.target.value })} aria-invalid={!!err.points || undefined} />
                <Button variant="ghost" size="icon" aria-label={`Hapus huruf ${name}`} onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))}>
                  <Trash2Icon />
                </Button>
                {message && <p className="col-span-4 -mt-1 px-1 text-xs font-medium text-destructive">{message}</p>}
              </div>
            )
          })}
          {(attempted || dirty) &&
            issues.general.map((g) => (
              <p key={g} className="text-sm font-medium text-destructive">
                {g}
              </p>
            ))}
          {serverFields.grade_scale && <p className="text-sm font-medium text-destructive">{serverFields.grade_scale}</p>}
          {serverError !== null && Object.keys(serverFields).length === 0 && <FormError error={serverError} />}
          <Button
            variant="outline"
            className="w-fit"
            disabled={rows.length >= 20}
            onClick={() => setRows((l) => [...l, { key: uuidv7(), letter: '', min: '', points: '' }])}
          >
            <PlusIcon /> Tambah huruf
          </Button>
        </div>
      </div>

      <SaveBar visible={dirty} pending={pending} canSave={!hasIssues} onCancel={reset} label="Skala nilai belum disimpan" saveLabel="Simpan skala" />
    </form>
  )
}

function BaselineForm({ settings: s }: { settings: Settings }) {
  const { save } = useSettingsCtx()
  const initialGpa = s.baseline.gpa === null ? '' : String(s.baseline.gpa).replace('.', ',')
  const [gpa, setGpa] = useState(initialGpa)
  const [credits, setCredits] = useState(String(s.baseline.credits))
  const [pending, setPending] = useState(false)
  const [serverError, setServerError] = useState<unknown>(null)

  const gpaNum = gpa.trim() === '' ? null : parseDecimal(gpa)
  const creditsNum = credits.trim() === '' ? 0 : Number(credits)
  const gpaError = gpaNum !== null && (Number.isNaN(gpaNum) || gpaNum < 0 || gpaNum > 4) ? 'Isi angka 0 sampai 4' : undefined
  const creditsError = !Number.isInteger(creditsNum) || creditsNum < 0 || creditsNum > 300 ? 'Isi 0 sampai 300' : undefined
  const dirty = gpaNum !== s.baseline.gpa || creditsNum !== s.baseline.credits
  useDirty('baseline', dirty)
  const errs = fieldErrors(serverError)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (gpaError || creditsError) return
    setPending(true)
    setServerError(null)
    try {
      await save({ baseline: { gpa: gpaNum, credits: creditsNum } }, { success: 'IPK awal disimpan', quietError: true })
    } catch (err) {
      setServerError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <form id="baseline" onSubmit={(e) => void submit(e)} noValidate className="scroll-mt-6">
      <h3 className="text-sm font-bold">IPK sebelum Kumlod</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Opsional. IPK dan total SKS lulus dari semester sebelumnya, supaya IPK kumulatif di{' '}
        <Link to="/nilai" className="font-semibold text-foreground underline decoration-brand decoration-2 underline-offset-4">
          Nilai
        </Link>{' '}
        akurat.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field id="b-gpa" label="IPK" error={gpaError ?? errs['baseline.gpa']}>
          <Input id="b-gpa" inputMode="decimal" placeholder="Misalnya 3,52" value={gpa} onChange={(e) => setGpa(e.target.value)} {...invalidProps('b-gpa', gpaError ?? errs['baseline.gpa'])} />
        </Field>
        <Field id="b-credits" label="Total SKS" error={creditsError ?? errs['baseline.credits']}>
          <Input
            id="b-credits"
            inputMode="numeric"
            value={credits}
            onChange={(e) => setCredits(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
            {...invalidProps('b-credits', creditsError ?? errs['baseline.credits'])}
          />
        </Field>
      </div>
      {gpaNum !== null && !gpaError && creditsNum === 0 && (
        <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">Isi total SKS juga. Tanpa SKS, IPK awal tidak ikut dihitung.</p>
      )}
      {serverError !== null && Object.keys(errs).length === 0 && <FormError error={serverError} />}
      <SaveBar
        visible={dirty}
        pending={pending}
        canSave={!gpaError && !creditsError}
        onCancel={() => {
          setGpa(initialGpa)
          setCredits(String(s.baseline.credits))
          setServerError(null)
        }}
        label="IPK awal belum disimpan"
      />
    </form>
  )
}

export function GradesSection({ settings: s }: { settings: Settings }) {
  return (
    <SettingsSection
      id="nilai"
      icon={GraduationCapIcon}
      tone="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
      title="Nilai dan IPK"
      description="Skala huruf mutu dipakai untuk nilai matkul, target nilai, IPS, dan IPK. Huruf resmi dari KHS tetap menang."
    >
      <ScaleEditor key={JSON.stringify(s.grade_scale)} settings={s} />
      <div className="my-6 border-t border-foreground/10" />
      <BaselineForm key={JSON.stringify(s.baseline)} settings={s} />
    </SettingsSection>
  )
}

// ========================================================== attendance

export function AttendanceSection({ settings: s }: { settings: Settings }) {
  const { save } = useSettingsCtx()
  const [minPct, setMinPct] = useState(String(s.default_min_attendance_pct))
  const [meetings, setMeetings] = useState(String(s.default_total_meetings))
  const pct = Number.parseInt(minPct, 10)
  const total = Number.parseInt(meetings, 10)
  const pctValid = Number.isInteger(pct) && pct >= 0 && pct <= 100
  const totalValid = Number.isInteger(total) && total >= 1 && total <= 40

  const savingPct = useAutoSave(pct, s.default_min_attendance_pct, pctValid, (v) =>
    save({ default_min_attendance_pct: v }, { success: `Minimal hadir default ${v}%` }),
  )
  const savingTotal = useAutoSave(total, s.default_total_meetings, totalValid, (v) =>
    save({ default_total_meetings: v }, { success: `Default ${v} pertemuan` }),
  )
  const a = absenceAllowance(totalValid ? total : s.default_total_meetings, pctValid ? pct : s.default_min_attendance_pct)

  return (
    <SettingsSection
      id="absensi"
      icon={UserCheckIcon}
      tone="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      title="Absensi"
      description="Cara Kumlod menghitung kehadiran dan jatah bolos."
    >
      <ToggleRow
        id="a-excused"
        label="Izin dan sakit dihitung tidak hadir"
        hint="Disarankan aktif supaya jatah bolos tidak kelihatan lebih longgar dari aturan kampus."
        checked={s.count_excused_as_absent}
        onSave={(v) => save({ count_excused_as_absent: v }, { success: v ? 'Izin dan sakit dihitung tidak hadir' : 'Izin dan sakit tidak mengurangi kehadiran' })}
      />

      <h3 className="mt-5 text-sm font-bold">Default untuk matkul baru</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">Matkul yang sudah ada diatur di halaman matkulnya masing-masing.</p>
      <div className="mt-3 grid gap-3 @md:grid-cols-2">
        <Stepper id="a-minpct" label="Minimal hadir" value={minPct} onChange={setMinPct} min={0} max={100} step={5} suffix="%" error={pctValid ? undefined : 'Isi 0 sampai 100'} />
        <Stepper id="a-meetings" label="Jumlah pertemuan" value={meetings} onChange={setMeetings} min={1} max={40} error={totalValid ? undefined : 'Isi 1 sampai 40'} />
      </div>
      <p className="mt-3 flex items-center gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm dark:bg-white/[0.03]" aria-live="polite">
        <span className="flex-1">
          {a.lectures} pertemuan kuliah{total >= 4 || (!totalValid && s.default_total_meetings >= 4) ? ' + UTS dan UAS' : ''}. Wajib hadir{' '}
          <strong className="tabular-nums">{a.required}</strong>, jatah bolos <strong className="tabular-nums">{a.allowed}</strong>.
        </span>
        {(savingPct || savingTotal) && <span className="shrink-0 text-xs text-muted-foreground">Menyimpan...</span>}
      </p>
    </SettingsSection>
  )
}

// ============================================================= general

export function GeneralSection({ settings: s }: { settings: Settings }) {
  const { save } = useSettingsCtx()
  const zones = useMemo(() => timeZones(), [])
  const device = useMemo(() => deviceTimeZone(), [])
  const now = useNow()
  const setZone = (tz: string) => void save({ timezone: tz }, { success: `Zona waktu: ${tz}` }).catch(() => undefined)

  return (
    <SettingsSection
      id="umum"
      icon={SlidersHorizontalIcon}
      tone="bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300"
      title="Tampilan dan waktu"
    >
      <div className="grid gap-5 @xl:grid-cols-2">
        <div className="grid content-start gap-2">
          <p className="text-sm font-semibold">Mode tampilan</p>
          <AppearancePicker />
          <p className="text-xs text-muted-foreground">Hanya untuk perangkat ini.</p>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="tz">Zona waktu</Label>
          <NativeSelect id="tz" value={s.timezone} onChange={(e) => setZone(e.target.value)}>
            {!zones.includes(s.timezone) && <option value={s.timezone}>{s.timezone}</option>}
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Sekarang {localTime(now, s.timezone)} {timeZoneShort(s.timezone, now)}. Menentukan "hari ini", jam deadline, dan jadwal reminder.
          </p>
          {device && device !== s.timezone && (
            <Button variant="outline" size="sm" className="w-fit" onClick={() => setZone(device)}>
              Pakai zona perangkat ini ({device})
            </Button>
          )}
        </div>
      </div>
    </SettingsSection>
  )
}

// ============================================================= account

export function AccountSection() {
  const me = useQuery(meQuery)
  const change = useChangePassword()
  const logout = useLogout()
  const router = useRouter()
  const errs = fieldErrors(change.error)
  const [open, setOpen] = useState(false)
  const [show, setShow] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const mismatch = repeat !== '' && next !== repeat
  const short = next !== '' && next.length < 8
  const username = me.data?.user.username ?? ''
  useDirty('password', open && (current !== '' || next !== '' || repeat !== ''))

  const close = () => {
    setOpen(false)
    setCurrent('')
    setNext('')
    setRepeat('')
    change.reset()
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mismatch || short) return
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          toast.success('Password diganti. Sesi di perangkat lain sudah dicabut.')
          close()
        },
      },
    )
  }

  return (
    <SettingsSection id="akun" icon={KeyRoundIcon} tone="bg-hero text-hero-foreground" title="Akun">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-brand text-base font-extrabold text-brand-foreground uppercase">
          {username.slice(0, 1) || '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{username || 'Memuat...'}</p>
          <p className="text-xs text-muted-foreground">Satu akun, tanpa pendaftaran publik</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!open && (
            <Button variant="outline" onClick={() => setOpen(true)}>
              <KeyRoundIcon /> Ganti password
            </Button>
          )}
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSettled: () => void router.navigate({ to: '/login' }) })}
          >
            <LogOutIcon /> Keluar
          </Button>
        </div>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-5 grid gap-3 rounded-2xl bg-muted/60 p-4 dark:bg-white/[0.03]" noValidate>
          <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Ganti password</h3>
            <Button variant="ghost" size="sm" onClick={() => setShow((v) => !v)} aria-pressed={show}>
              {show ? <EyeOffIcon /> : <EyeIcon />} {show ? 'Sembunyikan' : 'Tampilkan'}
            </Button>
          </div>
          <div className="grid gap-3 @2xl:grid-cols-3">
            <Field id="pw-current" label="Password lama" error={errs.current_password}>
              <Input id="pw-current" type={show ? 'text' : 'password'} autoComplete="current-password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} {...invalidProps('pw-current', errs.current_password)} />
            </Field>
            <Field id="pw-new" label="Password baru" error={short ? 'Minimal 8 karakter' : errs.new_password} hint="Minimal 8 karakter">
              <Input id="pw-new" type={show ? 'text' : 'password'} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} {...invalidProps('pw-new', short ? 'x' : errs.new_password)} />
            </Field>
            <Field id="pw-repeat" label="Ulangi password baru" error={mismatch ? 'Belum sama dengan password baru' : undefined}>
              <Input id="pw-repeat" type={show ? 'text' : 'password'} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} {...invalidProps('pw-repeat', mismatch ? 'x' : undefined)} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">Setelah diganti, semua perangkat lain otomatis keluar.</p>
          {Object.keys(errs).length === 0 && <FormError error={change.error} />}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Batal
            </Button>
            <Button type="submit" disabled={change.isPending || !current || next.length < 8 || next !== repeat}>
              {change.isPending ? 'Menyimpan...' : 'Ganti password'}
            </Button>
          </div>
        </form>
      )}
    </SettingsSection>
  )
}

// ============================================================= install

type Platform = 'ios' | 'android' | 'desktop'

const installSteps: Record<Platform, { title: string; icon: typeof SmartphoneIcon; steps: string[] }> = {
  ios: {
    title: 'iPhone (Safari, iOS 16.4 ke atas)',
    icon: SmartphoneIcon,
    steps: ['Buka Kumlod di Safari.', 'Tap Share (kotak dengan panah ke atas).', 'Pilih Add to Home Screen, lalu Add.', 'Buka dari ikon Home Screen supaya notifikasi jalan.'],
  },
  android: {
    title: 'Android (Chrome)',
    icon: SmartphoneIcon,
    steps: ['Tap menu titik tiga di kanan atas.', 'Pilih Install app atau Tambahkan ke Layar utama.'],
  },
  desktop: {
    title: 'Laptop (Chrome atau Edge)',
    icon: LaptopIcon,
    steps: ['Klik ikon install di ujung kanan address bar.', 'Atau buka menu, lalu pilih Install Kumlod.'],
  },
}

function detectPlatform(): Platform {
  if (isIOS()) return 'ios'
  if (/Android/i.test(navigator.userAgent)) return 'android'
  return 'desktop'
}

/** Whether the install section is worth showing: not when already running as an app. */
export const showInstall = () => !isStandalone()

export function InstallSection() {
  const platform = useMemo(detectPlatform, [])
  const mine = installSteps[platform]
  const others = (Object.keys(installSteps) as Platform[]).filter((p) => p !== platform)
  return (
    <SettingsSection
      id="install"
      icon={SmartphoneIcon}
      tone="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
      title="Install Kumlod"
      description="Terbuka seperti app, lebih cepat, dan tetap bisa dibuka saat offline."
    >
      <div className="rounded-2xl bg-muted/60 p-4 dark:bg-white/[0.03]">
        <p className="flex items-center gap-2 text-sm font-bold">
          <mine.icon className="size-4" aria-hidden /> {mine.title}
          <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[0.7rem] whitespace-nowrap text-brand-foreground">Perangkat ini</span>
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          {mine.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
      <details className="group mt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          Cara di perangkat lain
        </summary>
        <div className="mt-1 grid gap-2 @md:grid-cols-2">
          {others.map((p) => (
            <div key={p} className="rounded-2xl bg-muted/60 p-4 text-sm dark:bg-white/[0.03]">
              <p className="font-bold">{installSteps[p].title}</p>
              <p className="mt-1 text-muted-foreground">{installSteps[p].steps.join(' ')}</p>
            </div>
          ))}
        </div>
      </details>
    </SettingsSection>
  )
}
