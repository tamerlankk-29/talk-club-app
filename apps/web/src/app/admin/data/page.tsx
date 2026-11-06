'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, ShieldAlert, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { AdminPage } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, InlineAlert, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Card, Section, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/layout';
import { Modal } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, downloadFile, errorMessage, uploadFile } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useCan } from '@/lib/auth';
import { CLUB_TZ, fmt } from '@/lib/format';
import { DateTime } from 'luxon';

const DATASETS = [
  { key: 'clients', label: 'Clients', finance: false },
  { key: 'bookings', label: 'Bookings', finance: false },
  { key: 'attendance', label: 'Attendance', finance: false },
  { key: 'memberships', label: 'Memberships', finance: false },
  { key: 'leads', label: 'Leads (CRM)', finance: false },
  { key: 'payments', label: 'Payments', finance: true },
  { key: 'revenue', label: 'Revenue', finance: true },
];

const IMPORT_KINDS = [
  { key: 'clients', label: 'Clients (CSV / XLSX)', hint: 'Columns: firstName, lastName, phone, email, birthDate, level, source, notes' },
  { key: 'altegio-clients', label: 'Altegio — clients export', hint: 'The client list exported from Altegio' },
  { key: 'altegio-visits', label: 'Altegio — visits / records', hint: 'Past visits; matched to clients by phone' },
  { key: 'altegio-payments', label: 'Altegio — payments', hint: 'Payment history; matched to clients by phone' },
];

export default function DataPage() {
  const canExport = useCan('data.export');
  const canImport = useCan('data.import');
  const canGdpr = useCan('clients.delete');
  const defaultTab = canExport ? 'export' : canImport ? 'import' : 'gdpr';
  return (
    <AdminPage title="Import & export" description="Move data in and out of Talk Club, and handle personal-data requests.">
      <Tabs defaultValue={defaultTab}>
        <TabsList className="max-w-md">
          {canExport && <TabsTrigger value="export">Export</TabsTrigger>}
          {canImport && <TabsTrigger value="import">Import</TabsTrigger>}
          {canGdpr && <TabsTrigger value="gdpr">Data requests</TabsTrigger>}
        </TabsList>
        {canExport && (
          <TabsContent value="export">
            <ExportPanel />
          </TabsContent>
        )}
        {canImport && (
          <TabsContent value="import">
            <ImportPanel />
          </TabsContent>
        )}
        {canGdpr && (
          <TabsContent value="gdpr">
            <DataRequests />
          </TabsContent>
        )}
      </Tabs>
    </AdminPage>
  );
}

function ExportPanel() {
  const canFinance = useCan('finance.view');
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (dataset: string) => {
    setBusy(dataset);
    const params = new URLSearchParams({ format });
    if (from) params.set('from', DateTime.fromISO(from, { zone: CLUB_TZ }).startOf('day').toUTC().toISO()!);
    if (to) params.set('to', DateTime.fromISO(to, { zone: CLUB_TZ }).endOf('day').toUTC().toISO()!);
    try {
      await downloadFile(`/api/admin/exports/${dataset}?${params}`, `${dataset}.${format}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3">
        <Field label="Format" htmlFor="ex-format">
          <Select id="ex-format" value={format} onChange={(e) => setFormat(e.target.value as 'xlsx' | 'csv')} className="w-40">
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
          </Select>
        </Field>
        <Field label="From" htmlFor="ex-from" hint="Optional">
          <Input id="ex-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="ex-to" hint="Optional">
          <Input id="ex-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DATASETS.filter((d) => !d.finance || canFinance).map((d) => (
          <Card key={d.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-semibold">
              <FileSpreadsheet className="h-5 w-5 text-brand-700" /> {d.label}
            </span>
            <Button size="sm" variant="secondary" leftIcon={<Download className="h-4 w-4" />} loading={busy === d.key} onClick={() => run(d.key)}>
              Download
            </Button>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted">Every export is recorded in the audit log. Exported files contain personal data — store them securely.</p>
    </div>
  );
}

function ImportPanel() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState('clients');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<S<'ImportResultDto'> | null>(null);
  const [busy, setBusy] = useState(false);
  const history = useQuery({ queryKey: ['admin', 'imports'], queryFn: () => call(api.GET('/api/admin/imports')) });
  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await uploadFile<S<'ImportResultDto'>>(`/api/admin/imports/${kind}?dryRun=${dryRun}`, file);
      setResult(r);
      await qc.invalidateQueries({ queryKey: ['admin', 'imports'] });
      if (!dryRun) {
        await qc.invalidateQueries({ queryKey: ['admin', 'clients'] });
        toast.success(`Imported: ${r.created} created, ${r.updated} updated, ${r.skipped} skipped.`);
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const info = IMPORT_KINDS.find((k) => k.key === kind)!;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section title="Import a file">
        <Card className="space-y-4">
          <Field label="What are you importing?" htmlFor="im-kind" hint={info.hint}>
            <Select
              id="im-kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setResult(null);
              }}
            >
              {IMPORT_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center gap-3">
            <Button variant="outline" leftIcon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
              Choose file
            </Button>
            <span className="truncate text-sm text-muted">{file ? `${file.name} · ${Math.round(file.size / 1024)} KB` : 'CSV or XLSX, up to 10 MB'}</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
          </div>
          <InlineAlert tone="info">Clients are matched by phone (then email), so importing the same file twice never creates duplicates. Start with a preview.</InlineAlert>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!file} loading={busy && !result} onClick={() => run(true)}>
              Preview (dry run)
            </Button>
            <Button disabled={!file || !result?.dryRun} loading={busy && !!result} onClick={() => run(false)}>
              Import for real
            </Button>
          </div>
          {result && <ImportResult result={result} />}
        </Card>
      </Section>
      <Section title="Recent imports">
        <Card padded={false} className="divide-y divide-line/70">
          {history.isLoading ? (
            <Skeleton className="m-5 h-16" />
          ) : history.data?.length ? (
            history.data.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
                <span className="font-semibold">{j.fileName ?? j.source}</span>
                {j.dryRun && <Badge>preview</Badge>}
                <StatusBadge status={j.status} />
                <span className="text-muted">
                  {j.totalRows} rows · +{j.createdCount} / ~{j.updatedCount} / skipped {j.skippedCount}
                </span>
                <span className="ml-auto text-xs text-subtle">{fmt.dateTime(j.createdAt)}</span>
              </div>
            ))
          ) : (
            <p className="px-5 py-4 text-sm text-muted">No imports yet.</p>
          )}
        </Card>
      </Section>
    </div>
  );
}

function ImportResult({ result }: { result: S<'ImportResultDto'> }) {
  return (
    <div className="space-y-3 rounded-2xl border border-line p-4">
      <p className="text-sm font-semibold">{result.dryRun ? 'Preview — nothing was saved yet' : 'Import finished'}</p>
      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        <div className="rounded-xl bg-canvas p-2">
          <p className="font-display text-lg font-semibold">{result.total}</p>
          <p className="text-xs text-muted">rows</p>
        </div>
        <div className="rounded-xl bg-success-50 p-2">
          <p className="font-display text-lg font-semibold text-success-700">{result.created}</p>
          <p className="text-xs text-muted">new</p>
        </div>
        <div className="rounded-xl bg-brand-50 p-2">
          <p className="font-display text-lg font-semibold text-brand-800">{result.updated}</p>
          <p className="text-xs text-muted">updated</p>
        </div>
        <div className="rounded-xl bg-warning-50 p-2">
          <p className="font-display text-lg font-semibold text-warning-700">{result.skipped}</p>
          <p className="text-xs text-muted">skipped</p>
        </div>
      </div>
      {result.errors.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-xl bg-danger-50 p-3 text-xs text-danger-700">
          {result.errors.slice(0, 100).map((e, i) => (
            <p key={i}>{JSON.stringify(e)}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function DataRequests() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'PENDING' | 'COMPLETED' | 'REJECTED' | ''>('PENDING');
  const [rejecting, setRejecting] = useState<S<'DataRequestDto'> | null>(null);
  const [reason, setReason] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'data-requests', status],
    queryFn: () => call(api.GET('/api/admin/data-requests', { params: { query: { status: status || undefined } } })),
  });
  const reject = useMutation({
    mutationFn: () => call(api.POST('/api/admin/data-requests/{id}/reject', { params: { path: { id: rejecting!.id } }, body: { reason } })),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'data-requests'] }), qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] })]);
      setRejecting(null);
      setReason('');
      toast.success('Request declined.');
    },
  });
  return (
    <div className="space-y-4">
      <InlineAlert tone="info" icon={<ShieldAlert className="h-5 w-5" />}>
        Deletion requests are completed by anonymising the client (Client → Family & privacy → Anonymize). Payment records stay for accounting without personal data.
      </InlineAlert>
      <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-48" aria-label="Status">
        <option value="PENDING">Pending</option>
        <option value="COMPLETED">Completed</option>
        <option value="REJECTED">Declined</option>
        <option value="">All</option>
      </Select>
      {query.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !query.data?.length ? (
        <EmptyState title="No requests" />
      ) : (
        <Card padded={false} className="divide-y divide-line/70">
          {query.data.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-sm">
              <Badge tone={r.type === 'DELETION' ? 'danger' : 'info'}>{r.type === 'DELETION' ? 'Delete account' : 'Data export'}</Badge>
              <span className="font-semibold">{r.clientName ?? r.user.displayName ?? 'Unknown'}</span>
              <span className="text-muted">{fmt.phone(r.user.phone)}</span>
              {r.reason && <span className="text-muted">“{r.reason}”</span>}
              <StatusBadge status={r.status} />
              <span className="ml-auto text-xs text-subtle">{fmt.dateTime(r.createdAt)}</span>
              {r.status === 'PENDING' && (
                <div className="flex gap-2">
                  {r.clientId && (
                    <Link href={`/admin/clients/${r.clientId}?tab=privacy`} className="text-xs font-semibold text-brand-700">
                      Open client
                    </Link>
                  )}
                  <button type="button" className="text-xs font-semibold text-danger-700" onClick={() => setRejecting(r)}>
                    Decline
                  </button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      <Modal
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title="Decline this request?"
        description="Explain why (recorded in the audit log), and let the client know directly."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Back
            </Button>
            <Button variant="danger" loading={reject.isPending} disabled={reason.trim().length < 3} onClick={() => reject.mutate()}>
              Decline
            </Button>
          </>
        }
      >
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Active membership — client asked to wait" />
        {reject.error && <p className="mt-2 text-sm text-danger-700">{errorMessage(reject.error)}</p>}
      </Modal>
    </div>
  );
}
