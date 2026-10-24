'use client';

import { BellRing, Share, SquarePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast, toastError } from '@/components/ui/toast';
import { enablePush, getPushState, type PushState } from '@/lib/push';
import { Rich, useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/client-shell';

/** Invites the member to turn on push reminders (or explains how on iPhone). */
export function PushPrompt({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useT(shellMessages);
  useEffect(() => {
    void getPushState().then(setState);
  }, []);

  if (state === 'needs-install') {
    return (
      <div className="rounded-3xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-100">
        <p className="flex items-center gap-2 font-semibold">
          <BellRing className="h-4 w-4" /> {t.iphoneTitle}
        </p>
        <p className="mt-1 text-brand-900/80">
          <Rich
            text={t.iphoneSteps}
            tags={{
              share: (c) => (
                <>
                  <Share className="inline h-4 w-4 align-text-bottom" /> {c}
                </>
              ),
              add: (c) => (
                <>
                  <SquarePlus className="inline h-4 w-4 align-text-bottom" /> {c}
                </>
              ),
            }}
          />
        </p>
      </div>
    );
  }
  if (state !== 'available') return null;
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-brand-700 p-4 text-white shadow-float">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
        <BellRing className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{t.pushTitle}</p>
        {!compact && <p className="text-white/80">{t.pushText}</p>}
      </div>
      <Button
        variant="accent"
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const next = await enablePush();
            setState(next);
            if (next === 'enabled') toast.success(t.pushOn);
            if (next === 'denied') toast.error(t.pushBlocked);
          } catch (error) {
            toastError(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t.enable}
      </Button>
    </div>
  );
}
