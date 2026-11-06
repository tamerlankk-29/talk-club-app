'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileText, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { RequireAuth } from '@/components/client/require-auth';
import { Button } from '@/components/ui/button';
import { InlineAlert, SkeletonList } from '@/components/ui/feedback';
import { Textarea } from '@/components/ui/inputs';
import { Card, PageHeader, Section } from '@/components/ui/layout';
import { ConfirmDialog } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, downloadFile } from '@/lib/api/client';
import { fmt } from '@/lib/format';
import { keys } from '@/lib/queries';

export default function PrivacyPage() {
  return (
    <RequireAuth>
      <Privacy />
    </RequireAuth>
  );
}

function Privacy() {
  const agreements = useQuery({ queryKey: keys.agreements, queryFn: () => call(api.GET('/api/my/agreements')) });
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [requested, setRequested] = useState(false);
  const deletion = useMutation({
    mutationFn: () => call(api.POST('/api/my/deletion-request', { body: { reason: reason.trim() || undefined } })),
    onSuccess: () => {
      setDeleteOpen(false);
      setRequested(true);
      toast.success('Request received. The club will contact you to confirm.');
    },
    onError: toastError,
  });

  return (
    <div className="space-y-6 pt-5">
      <PageHeader back="/profile" title="Privacy & data" />

      <Section title="Your data">
        <Card className="space-y-3">
          <p className="text-sm text-muted">Download a copy of your profile, bookings, memberships, payments, feedback and consents (JSON).</p>
          <Button
            variant="outline"
            leftIcon={<Download className="h-4 w-4" />}
            loading={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await downloadFile('/api/my/data-export', 'talk-club-my-data.json');
              } catch (e) {
                toastError(e);
              } finally {
                setExporting(false);
              }
            }}
          >
            Download my data
          </Button>
        </Card>
      </Section>

      <Section title="Agreements">
        {agreements.isLoading ? (
          <SkeletonList count={2} />
        ) : (
          <Card padded={false} className="divide-y divide-line/70">
            {agreements.data?.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5 text-sm">
                <FileText className="h-4 w-4 text-brand-700" />
                <div className="min-w-0 flex-1">
                  <Link href={`/legal/${a.type}`} className="font-semibold hover:text-brand-700">
                    {a.title}
                  </Link>
                  <p className="text-xs text-muted">
                    Version {a.version} · accepted {fmt.date(a.acceptedAt)}
                  </p>
                </div>
              </div>
            ))}
            {!agreements.data?.length && <p className="px-5 py-4 text-sm text-muted">No agreements recorded.</p>}
          </Card>
        )}
      </Section>

      <Section title="Delete account">
        <Card className="space-y-3">
          {requested ? (
            <InlineAlert tone="success">Your deletion request was sent. The administrator will confirm it with you; payment records are kept as required by law.</InlineAlert>
          ) : (
            <>
              <p className="text-sm text-muted">
                We will delete or anonymise your personal data. Remaining visits on your membership will be lost. Payment records are kept as required by law.
              </p>
              <Button variant="ghost" className="text-danger-700 hover:bg-danger-50" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>
                Request account deletion
              </Button>
            </>
          )}
        </Card>
      </Section>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete your account?"
        description="This sends a deletion request to the club. Your remaining visits will be lost once it's processed."
        confirmLabel="Send request"
        cancelLabel="Keep my account"
        tone="danger"
        loading={deletion.isPending}
        onConfirm={() => deletion.mutate()}
      >
        <Textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
      </ConfirmDialog>
    </div>
  );
}
