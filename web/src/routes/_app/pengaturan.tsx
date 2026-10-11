import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import {
  AlarmClockIcon,
  BellIcon,
  BellOffIcon,
  BellRingIcon,
  GlobeIcon,
  GraduationCapIcon,
  HistoryIcon,
  InfoIcon,
  KeyRoundIcon,
  LogOutIcon,
  PlusIcon,
  SendIcon,
  SmartphoneIcon,
  SunMoonIcon,
  Trash2Icon,
  UserCheckIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { client, errorMessage, unwrap, type Settings } from '@/api/client'
import {
  meQuery,
  pushKeyQuery,
  useChangePassword,
  useLogout,
  useSubscribePush,
  useTestPush,
  useUnsubscribePush,
  useUpdateSettings,
} from '@/api/queries'
import { AppearancePicker } from '@/components/AppearanceControl'
import { ErrorState, Field, FormError, invalidProps, LoadingList, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/misc'
import { timeZones } from '@/lib/dates'
import { fieldErrors, useAppSettings } from '@/lib/hooks'
import { gradeScalePresets, type GradeScaleEntry } from '@/lib/labels'
import { currentSubscription, isIOS, isStandalone, pushSupported, subscribeDevice, unsubscribeDevice } from '@/lib/push'
import { uuidv7 } from '@/lib/uuid'

export const Route = createFileRoute('/_app/pengaturan')({
  component: SettingsPage,
})

function SettingsPage() {
  const settings = useAppSettings()
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Pengaturan" description="Atur notifikasi, aturan absen, skala nilai, dan akun kamu." />
      <div className="grid gap-5">
        <PushCard />
        <AppearanceCard />
        {settings.data === undefined ? (
          settings.isError ? <ErrorState error={settings.error} onRetry={() => void settings.refetch()} /> : <LoadingList rows={4} />
        ) : (
          <SettingsForm key={JSON.stringify(settings.data)} settings={settings.data} />
        )}
        <AccountCard />
        <InstallCard />
        <AboutCard />
      </div>
    </div>
  )
}

// ---------------- Push on this device ----------------

type PushState = 'loading' | 'unsupported' | 'ios-browser' | 'no-sw' | 'denied' | 'off' | 'on'

function PushCard() {
  const key = useQuery(pushKeyQuery)
  const subscribe = useSubscribePush()
  const unsubscribe = useUnsubscribePush()
  const test = useTestPush()
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    if (isIOS() && !isStandalone()) return setState('ios-browser')
    if (!pushSupported()) return setState('unsupported')
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return setState('no-sw')
    if (Notification.permission === 'denied') return setState('denied')
    setState((await currentSubscription()) ? 'on' : 'off')
  }

  useEffect(() => {
    void refresh()
  }, [])

  const enable = async () => {
    if (!key.data) return
    setBusy(true)
    try {
      const sub = await subscribeDevice(key.data)
      await subscribe.mutateAsync(sub)
      toast.success('Notifikasi aktif di perangkat ini')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const disable = async () => {
    setBusy(true)
    try {
      const endpoint = await unsubscribeDevice()
      if (endpoint) await unsubscribe.mutateAsync(endpoint)
      toast.success('Notifikasi dimatikan di perangkat ini')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const sendTest = () =>
    test.mutate(undefined, {
      onSuccess: (r) => {
        if (r.sent + r.failed === 0) toast.error('Belum ada perangkat yang mengaktifkan notifikasi')
        else if (r.failed === 0) toast.success(`Notifikasi uji terkirim ke ${r.sent} perangkat`)
        else toast.warning(`Terkirim ke ${r.sent} perangkat, gagal ke ${r.failed}`)
      },
    })

  return (
    <Card>
      <CardHeader>
        <IconTitle icon={BellRingIcon} tone="bg-brand text-brand-foreground">
          Notifikasi di perangkat ini
        </IconTitle>
        <CardDescription>Reminder deadline, pengingat absen, dan ringkasan pagi. Aktifkan di tiap HP dan laptop.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {state === 'loading' && <p className="text-sm text-muted-foreground">Memeriksa...</p>}
        {state === 'ios-browser' && (
          <div className="rounded-2xl bg-muted p-4 text-sm">
            <p className="font-medium">Di iPhone, notifikasi cuma jalan dari Home Screen.</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Buka Kumlod di Safari.</li>
              <li>Tap tombol Share (kotak dengan panah ke atas).</li>
              <li>Pilih Add to Home Screen, lalu Add.</li>
              <li>Buka Kumlod dari ikon di Home Screen, lalu kembali ke halaman ini.</li>
            </ol>
          </div>
        )}
        {state === 'unsupported' && <p className="text-sm">Browser ini belum mendukung push notification.</p>}
        {state === 'no-sw' && (
          <p className="text-sm text-muted-foreground">Service worker belum aktif. Muat ulang halaman, atau pakai versi build (bukan dev server).</p>
        )}
        {state === 'denied' && (
          <p className="text-sm">
            Izin notifikasi diblokir. Buka pengaturan situs di browser (ikon gembok di address bar) atau pengaturan aplikasi di HP, izinkan
            notifikasi, lalu muat ulang.
          </p>
        )}
        {state === 'off' && (
          <Button onClick={() => void enable()} disabled={busy || !key.data} className="w-fit">
            <BellIcon /> {busy ? 'Mengaktifkan...' : 'Aktifkan notifikasi'}
          </Button>
        )}
        {state === 'on' && (
          <>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Notifikasi aktif di perangkat ini.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={sendTest} disabled={test.isPending}>
                <SendIcon /> {test.isPending ? 'Mengirim...' : 'Kirim notifikasi uji'}
              </Button>
              <Button variant="ghost" onClick={() => void disable()} disabled={busy}>
                <BellOffIcon /> Matikan di perangkat ini
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------- Settings form ----------------

type ScaleRow = { key: string; letter: string; min: string; points: string }

const toRows = (scale: GradeScaleEntry[]): ScaleRow[] =>
  scale.map((e) => ({ key: uuidv7(), letter: e.letter, min: String(e.min_score), points: String(e.points) }))

const num = (v: string) => Number(v.trim().replace(',', '.'))

function SettingsForm({ settings: s }: { settings: Settings }) {
  const update = useUpdateSettings()
  const errs = fieldErrors(update.error)
  const zones = useMemo(() => timeZones(), [])

  const [taskOn, setTaskOn] = useState(s.reminders.task_enabled)
  const [attendanceOn, setAttendanceOn] = useState(s.reminders.attendance_enabled)
  const [digestOn, setDigestOn] = useState(s.reminders.digest_enabled)
  const [digestTime, setDigestTime] = useState(s.reminders.digest_time)
  const [countExcused, setCountExcused] = useState(s.count_excused_as_absent)
  const [minPct, setMinPct] = useState(String(s.default_min_attendance_pct))
  const [meetings, setMeetings] = useState(String(s.default_total_meetings))
  const [rows, setRows] = useState<ScaleRow[]>(() => toRows(s.grade_scale))
  const [baseGpa, setBaseGpa] = useState(s.baseline.gpa === null ? '' : String(s.baseline.gpa))
  const [baseCredits, setBaseCredits] = useState(String(s.baseline.credits))
  const [timezone, setTimezone] = useState(s.timezone)

  const setRow = (key: string, patch: Partial<ScaleRow>) => setRows((l) => l.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    update.mutate(
      {
        timezone,
        grade_scale: rows.map((r) => ({ letter: r.letter.trim(), min_score: num(r.min), points: num(r.points) })),
        count_excused_as_absent: countExcused,
        default_min_attendance_pct: Number.parseInt(minPct, 10),
        default_total_meetings: Number.parseInt(meetings, 10),
        reminders: {
          task_enabled: taskOn,
          attendance_enabled: attendanceOn,
          digest_enabled: digestOn,
          digest_time: digestTime,
        },
        baseline: { gpa: baseGpa.trim() === '' ? null : num(baseGpa), credits: Number.parseInt(baseCredits || '0', 10) },
      },
      { onSuccess: () => toast.success('Pengaturan disimpan') },
    )
  }

  const scaleError = Object.entries(errs).find(([k]) => k.startsWith('grade_scale'))?.[1]

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <Card>
        <CardHeader>
          <IconTitle icon={AlarmClockIcon} tone="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
            Reminder
          </IconTitle>
          <CardDescription>Berlaku untuk semua perangkat yang notifikasinya aktif.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ToggleRow id="r-task" label="Reminder deadline tugas" hint="3 hari, 24 jam, dan 3 jam sebelum deadline." checked={taskOn} onChange={setTaskOn} />
          <ToggleRow id="r-att" label="Pengingat absen" hint="15 menit setelah kuliah mulai kalau belum dicatat." checked={attendanceOn} onChange={setAttendanceOn} />
          <ToggleRow id="r-digest" label="Ringkasan harian" hint="Kuliah hari ini dan deadline 48 jam ke depan." checked={digestOn} onChange={setDigestOn} />
          <Field id="r-digest-time" label="Jam ringkasan" error={errs['reminders.digest_time']}>
            <Input id="r-digest-time" type="time" className="max-w-40" value={digestTime} onChange={(e) => setDigestTime(e.target.value)} disabled={!digestOn} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <IconTitle icon={UserCheckIcon} tone="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Absensi
          </IconTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ToggleRow
            id="a-excused"
            label="Izin dan sakit dihitung tidak hadir"
            hint="Disarankan aktif supaya jatah bolos tidak kelihatan lebih longgar."
            checked={countExcused}
            onChange={setCountExcused}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field id="a-minpct" label="Minimal hadir default (%)" error={errs.default_min_attendance_pct}>
              <Input id="a-minpct" inputMode="numeric" value={minPct} onChange={(e) => setMinPct(e.target.value)} {...invalidProps('a-minpct', errs.default_min_attendance_pct)} />
            </Field>
            <Field id="a-meetings" label="Jumlah pertemuan default" error={errs.default_total_meetings}>
              <Input id="a-meetings" inputMode="numeric" value={meetings} onChange={(e) => setMeetings(e.target.value)} {...invalidProps('a-meetings', errs.default_total_meetings)} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <IconTitle icon={GraduationCapIcon} tone="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
            Skala nilai
          </IconTitle>
          <CardDescription>Dipakai untuk huruf mutu, target nilai, IPS, dan IPK.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!s.grade_scale_confirmed && (
            <p className="flex items-start gap-2 rounded-2xl bg-sky-100 px-4 py-3 text-sm font-medium text-sky-950 dark:bg-sky-950 dark:text-sky-200">
              <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              Cocokkan skala ini dengan KHS atau pedoman akademik kampus kamu, lalu simpan.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {gradeScalePresets.map((p) => (
              <Button key={p.id} variant="outline" size="sm" className="h-11" onClick={() => setRows(toRows(p.scale))}>
                Pakai {p.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_2.75rem] gap-2 text-sm font-medium text-muted-foreground" aria-hidden>
              <span>Huruf</span>
              <span>Nilai minimal</span>
              <span>Bobot</span>
              <span />
            </div>
            {rows.map((r, i) => (
              <div key={r.key} className="grid grid-cols-[1fr_1fr_1fr_2.75rem] gap-2">
                <Input aria-label={`Huruf baris ${i + 1}`} maxLength={3} value={r.letter} onChange={(e) => setRow(r.key, { letter: e.target.value })} aria-invalid={!!errs[`grade_scale[${i}].letter`] || undefined} />
                <Input aria-label={`Nilai minimal ${r.letter || `baris ${i + 1}`}`} inputMode="decimal" value={r.min} onChange={(e) => setRow(r.key, { min: e.target.value })} aria-invalid={!!errs[`grade_scale[${i}].min_score`] || undefined} />
                <Input aria-label={`Bobot ${r.letter || `baris ${i + 1}`}`} inputMode="decimal" value={r.points} onChange={(e) => setRow(r.key, { points: e.target.value })} aria-invalid={!!errs[`grade_scale[${i}].points`] || undefined} />
                <Button variant="ghost" size="icon" aria-label={`Hapus huruf ${r.letter || i + 1}`} onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))}>
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            {scaleError && <p className="text-sm text-destructive">{scaleError}</p>}
            <Button
              variant="outline"
              className="w-fit"
              disabled={rows.length >= 20}
              onClick={() => setRows((l) => [...l, { key: uuidv7(), letter: '', min: '', points: '' }])}
            >
              <PlusIcon /> Tambah huruf
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card id="baseline">
        <CardHeader>
          <IconTitle icon={HistoryIcon} tone="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
            IPK sebelum Kumlod
          </IconTitle>
          <CardDescription>Opsional. Isi IPK dan total SKS lulus dari semester sebelumnya supaya IPK kumulatif akurat.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Field id="b-gpa" label="IPK" error={errs['baseline.gpa']}>
            <Input id="b-gpa" inputMode="decimal" placeholder="Kosong" value={baseGpa} onChange={(e) => setBaseGpa(e.target.value)} {...invalidProps('b-gpa', errs['baseline.gpa'])} />
          </Field>
          <Field id="b-credits" label="Total SKS" error={errs['baseline.credits']}>
            <Input id="b-credits" inputMode="numeric" value={baseCredits} onChange={(e) => setBaseCredits(e.target.value)} {...invalidProps('b-credits', errs['baseline.credits'])} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <IconTitle icon={GlobeIcon} tone="bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300">
            Zona waktu
          </IconTitle>
          <CardDescription>Menentukan "hari ini", jam deadline, dan jadwal reminder.</CardDescription>
        </CardHeader>
        <CardContent>
          <Field id="tz" label="Zona waktu" error={errs.timezone}>
            <NativeSelect id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {!zones.includes(timezone) && <option value={timezone}>{timezone}</option>}
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </CardContent>
      </Card>

      {Object.keys(errs).length === 0 ? <FormError error={update.error} /> : <p className="text-sm text-destructive">Periksa isian yang ditandai.</p>}
      <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20 flex justify-start md:bottom-4 md:justify-end">
        <Button type="submit" size="lg" className="shadow-xl ring-4 ring-background" disabled={update.isPending}>
          {update.isPending ? 'Menyimpan...' : 'Simpan pengaturan'}
        </Button>
      </div>
    </form>
  )
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

// ---------------- Account ----------------

function AccountCard() {
  const me = useQuery(meQuery)
  const change = useChangePassword()
  const logout = useLogout()
  const router = useRouter()
  const errs = fieldErrors(change.error)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const mismatch = repeat !== '' && next !== repeat

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mismatch) return
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          toast.success('Password diganti. Sesi di perangkat lain sudah dicabut.')
          setCurrent('')
          setNext('')
          setRepeat('')
        },
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <IconTitle icon={KeyRoundIcon} tone="bg-hero text-hero-foreground">
          Akun
        </IconTitle>
        {me.data && <CardDescription>Masuk sebagai {me.data.user.username}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-5">
        <form onSubmit={submit} className="grid gap-3" noValidate>
          <input type="text" name="username" autoComplete="username" value={me.data?.user.username ?? ''} readOnly hidden />
          <Field id="pw-current" label="Password lama" error={errs.current_password}>
            <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} {...invalidProps('pw-current', errs.current_password)} />
          </Field>
          <Field id="pw-new" label="Password baru" error={errs.new_password} hint="Minimal 8 karakter.">
            <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} {...invalidProps('pw-new', errs.new_password)} />
          </Field>
          <Field id="pw-repeat" label="Ulangi password baru" error={mismatch ? 'Password baru tidak sama' : undefined}>
            <Input id="pw-repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} {...invalidProps('pw-repeat', mismatch ? 'x' : undefined)} />
          </Field>
          {Object.keys(errs).length === 0 && <FormError error={change.error} />}
          <Button type="submit" variant="outline" className="w-fit" disabled={change.isPending || !current || next.length < 8 || mismatch}>
            {change.isPending ? 'Menyimpan...' : 'Ganti password'}
          </Button>
        </form>
        <Button
          variant="outline"
          className="w-fit"
          disabled={logout.isPending}
          onClick={() => logout.mutate(undefined, { onSettled: () => void router.navigate({ to: '/login' }) })}
        >
          <LogOutIcon /> Keluar
        </Button>
      </CardContent>
    </Card>
  )
}

function IconTitle({ icon: Icon, tone, children }: { icon: LucideIcon; tone: string; children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-3">
      <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
        <Icon className="size-5" />
      </span>
      {children}
    </CardTitle>
  )
}

// ---------------- Appearance on this device ----------------

function AppearanceCard() {
  return (
    <Card>
      <CardHeader>
        <IconTitle icon={SunMoonIcon} tone="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Tampilan
        </IconTitle>
        <CardDescription>Mode terang, gelap, atau ikuti pengaturan sistem. Berlaku di perangkat ini.</CardDescription>
      </CardHeader>
      <CardContent>
        <AppearancePicker />
      </CardContent>
    </Card>
  )
}

// ---------------- Install and about ----------------

function InstallCard() {
  return (
    <Card>
      <CardHeader>
        <IconTitle icon={SmartphoneIcon} tone="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
          Cara install Kumlod
        </IconTitle>
        <CardDescription>Setelah di-install, Kumlod terbuka seperti app dan tetap bisa dibuka saat offline.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="rounded-2xl bg-muted p-4">
          <p className="font-bold">Android (Chrome)</p>
          <p className="text-muted-foreground">Tap menu titik tiga, lalu Install app atau Tambahkan ke Layar utama.</p>
        </div>
        <div className="rounded-2xl bg-muted p-4">
          <p className="font-bold">iPhone (Safari, iOS 16.4 ke atas)</p>
          <p className="text-muted-foreground">Tap Share, lalu Add to Home Screen. Notifikasi hanya jalan kalau dibuka dari ikon Home Screen.</p>
        </div>
        <div className="rounded-2xl bg-muted p-4">
          <p className="font-bold">Laptop (Chrome atau Edge)</p>
          <p className="text-muted-foreground">Klik ikon install di address bar, atau menu, lalu Install Kumlod.</p>
        </div>
      </CardContent>
    </Card>
  )
}

function AboutCard() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => unwrap(client.GET('/api/health')), staleTime: Infinity })
  return (
    <p className="text-center text-xs text-muted-foreground">
      Kumlod {health.data ? `versi ${health.data.version}` : ''} · data kamu tersimpan di server sendiri
    </p>
  )
}
