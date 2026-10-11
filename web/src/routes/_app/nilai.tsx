import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { TargetIcon } from 'lucide-react'
import { useState } from 'react'

import { gpaQuery } from '@/api/queries'
import { ErrorState, LoadingList, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useDebounced } from '@/lib/hooks'
import { simulationStatusLabel } from '@/lib/labels'
import { cn, formatNumber } from '@/lib/utils'

export const Route = createFileRoute('/_app/nilai')({
  component: GpaPage,
})

const simVariant = { secured: 'success', possible: 'info', impossible: 'danger', no_credits: 'secondary' } as const

function GpaPage() {
  const [targetText, setTargetText] = useState('')
  const debounced = useDebounced(targetText.trim().replace(',', '.'), 400)
  const parsed = debounced === '' ? null : Number(debounced)
  const target = parsed !== null && Number.isFinite(parsed) && parsed >= 0 && parsed <= 4 ? parsed : null
  const invalidTarget = debounced !== '' && target === null
  const gpa = useQuery(gpaQuery(target))

  if (gpa.data === undefined) {
    return gpa.isError ? <ErrorState error={gpa.error} onRetry={() => void gpa.refetch()} /> : <LoadingList rows={4} />
  }
  const g = gpa.data
  const sim = g.simulation
  const ipkPct = g.ipk === null ? 0 : Math.min(100, (g.ipk / 4) * 100)

  return (
    <>
      <PageHeader title="Nilai" description="IPS per semester dan IPK kumulatif. Huruf resmi KHS mengalahkan hasil hitung." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <section aria-labelledby="ipk-title" className="relative overflow-hidden rounded-[2rem] bg-hero p-6 text-hero-foreground md:p-7">
          <div aria-hidden className="dot-grid absolute inset-0 text-white/[0.06]" />
          <div aria-hidden className="absolute -right-14 -bottom-16 size-48 rounded-full bg-[#ff6b4a]" />
          <div aria-hidden className="absolute right-16 bottom-24 size-10 rounded-full bg-sky-400" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="ipk-title" className="text-sm font-bold tracking-[0.14em] uppercase opacity-70">
                IPK kumulatif
              </h2>
              {g.is_projected && <Badge variant="brand">Proyeksi</Badge>}
            </div>
            <p className="mt-4 text-7xl leading-none font-extrabold tracking-tighter text-brand tabular-nums md:text-8xl">
              {formatNumber(g.ipk)}
            </p>
            <p className="mt-1 text-sm font-medium opacity-60">dari 4,00</p>
            <div aria-hidden className="mt-6 h-3 max-w-xs overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-brand" style={{ width: `${ipkPct}%` }} />
            </div>
            <p className="mt-4 max-w-xs text-sm opacity-75">
              {g.total_graded_credits} SKS dihitung
              {g.baseline.gpa !== null && g.baseline.credits > 0 && ` (termasuk ${g.baseline.credits} SKS sebelum Kumlod)`}
              {g.is_projected && '. Masih ada huruf sementara.'}
            </p>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>IPS per semester</CardTitle>
          </CardHeader>
          <CardContent>
            {g.semesters.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada semester.</p>
            ) : (
              <>
                <div aria-hidden className="no-scrollbar flex h-52 items-end gap-2.5 overflow-x-auto pb-1">
                  {[...g.semesters].reverse().map((s) => {
                    const pct = s.ips === null ? 0 : Math.max(8, (s.ips / 4) * 100)
                    return (
                      <div key={s.semester_id} className="flex h-full min-w-16 flex-1 flex-col items-center gap-2">
                        <div className="relative flex w-full flex-1 items-end overflow-hidden rounded-2xl bg-muted">
                          <div
                            className={cn('relative w-full rounded-2xl transition-[height]', s.is_active ? 'bg-brand' : 'bg-foreground/15')}
                            style={{ height: `${pct}%` }}
                          >
                            <span
                              className={cn(
                                'absolute top-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                                s.is_active ? 'bg-hero text-hero-foreground' : 'bg-card text-foreground',
                              )}
                            >
                              {formatNumber(s.ips)}
                            </span>
                          </div>
                        </div>
                        <span className="w-full truncate text-center text-xs font-semibold text-muted-foreground">{s.name}</span>
                      </div>
                    )
                  })}
                </div>
                <ul className="mt-5 divide-y text-sm">
                  {g.semesters.map((s) => (
                    <li key={s.semester_id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <Link to="/matkul" search={{ semester: s.semester_id }} className="font-bold hover:underline">
                          {s.name}
                        </Link>
                        <span className="ml-2 inline-flex gap-1 align-middle">
                          {s.is_active && <Badge>Aktif</Badge>}
                          {s.is_projected && <Badge variant="warning">Proyeksi</Badge>}
                        </span>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {s.graded_credits === s.credits ? `${s.credits} SKS` : `${s.graded_credits} dari ${s.credits} SKS sudah ada nilai`}
                        </p>
                      </div>
                      <p className="text-right">
                        <span className="block text-xs text-muted-foreground">IPS</span>
                        <span className="text-xl font-extrabold tabular-nums">{formatNumber(s.ips)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <section aria-labelledby="sim-title" className="scallop bg-[#3a54f0] px-5 py-12 text-white md:px-8 lg:col-span-2">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center">
            <div>
              <span aria-hidden className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-white/15">
                <TargetIcon className="size-6" />
              </span>
              <h2 id="sim-title" className="text-2xl font-extrabold tracking-tight md:text-3xl">
                Simulasi target IPK
              </h2>
              <p className="mt-2 max-w-md text-sm text-white/80">
                IPS minimal yang perlu dikejar di semester aktif supaya IPK mencapai target.
              </p>
            </div>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <label htmlFor="target-ipk" className="text-sm font-semibold">
                  Target IPK
                </label>
                <Input
                  id="target-ipk"
                  inputMode="decimal"
                  placeholder="Misalnya 3,50"
                  className="h-14 max-w-56 rounded-full border-transparent text-lg font-bold text-foreground"
                  value={targetText}
                  onChange={(e) => setTargetText(e.target.value)}
                  aria-invalid={invalidTarget || undefined}
                  aria-describedby={invalidTarget ? 'target-ipk-error' : undefined}
                />
                {invalidTarget && (
                  <p id="target-ipk-error" className="text-sm font-semibold text-white">
                    Isi angka 0 sampai 4
                  </p>
                )}
              </div>
              {sim && (
                <div aria-live="polite" className={cn('rounded-3xl bg-card p-4 text-foreground', gpa.isPlaceholderData && 'opacity-60')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={simVariant[sim.status]}>{simulationStatusLabel[sim.status]}</Badge>
                    {sim.required_ips !== null && sim.status !== 'secured' && (
                      <span className="text-sm">
                        Butuh IPS minimal <strong className="text-lg tabular-nums">{formatNumber(sim.required_ips)}</strong> semester ini
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {sim.status === 'secured' && `IPK ${formatNumber(sim.target_ipk)} tetap tercapai berapa pun IPS semester ini.`}
                    {sim.status === 'possible' && 'Masih bisa dicapai. Cek target nilai per matkul di tab Nilai.'}
                    {sim.status === 'impossible' && 'IPS maksimal 4, jadi target ini belum bisa dicapai semester ini.'}
                    {sim.status === 'no_credits' && 'Semester aktif belum punya matkul dengan SKS.'}
                  </p>
                </div>
              )}
              <p className="text-sm text-white/80">
                IPK dan SKS sebelum pakai Kumlod bisa diisi di{' '}
                <Link to="/pengaturan" hash="baseline" className="font-bold text-white underline underline-offset-4">
                  Pengaturan
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
