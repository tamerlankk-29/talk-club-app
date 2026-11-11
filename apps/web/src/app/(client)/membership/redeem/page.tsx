'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RequireAuth } from '@/components/client/require-auth';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/inputs';
import { Card, PageHeader } from '@/components/ui/layout';
import { toast } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import { keys } from '@/lib/queries';
import { useT } from '@/lib/i18n';
import { membershipMessages } from '@/lib/i18n/messages/membership';

export default function RedeemGiftPage() {
  return (
    <RequireAuth>
      <Redeem />
    </RequireAuth>
  );
}

function Redeem() {
  const t = useT(membershipMessages);
  const router = useRouter();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const redeem = useMutation({
    mutationFn: () => call(api.POST('/api/my/gift-certificates/redeem', { body: { code } })),
    onSuccess: async (r) => {
      await Promise.all([qc.invalidateQueries({ queryKey: keys.membership }), qc.invalidateQueries({ queryKey: keys.home })]);
      toast.success(t.redeemed(r.planName));
      router.push(`/membership/${r.membershipId}`);
    },
  });

  return (
    <div className="space-y-5 pt-5">
      <PageHeader back="/membership" title={t.redeemTitle} />
      <Card className="space-y-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zest text-brand-950">
          <Gift className="h-6 w-6" />
        </span>
        <p className="text-sm text-muted">{t.redeemText}</p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            redeem.mutate();
          }}
        >
          <Field label={t.codeLabel} htmlFor="gift-code">
            <Input
              id="gift-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="TC-XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="font-mono text-lg tracking-wider"
            />
          </Field>
          {redeem.error && <InlineAlert tone="danger">{errorMessage(redeem.error)}</InlineAlert>}
          <Button type="submit" size="lg" block loading={redeem.isPending} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 8}>
            {t.redeemButton}
          </Button>
        </form>
      </Card>
      <p className="text-center text-sm text-muted">{t.giftAtDesk}</p>
    </div>
  );
}
