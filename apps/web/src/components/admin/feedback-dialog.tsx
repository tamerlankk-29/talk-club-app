'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Checkbox, Field, Textarea } from '@/components/ui/inputs';
import { Modal } from '@/components/ui/overlay';
import { toast } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const SKILLS = ['participation', 'fluency', 'vocabulary', 'confidence', 'pronunciation', 'conversation'] as const;

/** Teacher feedback for one participant: 1–5 ratings per skill and a comment. */
export interface FeedbackValues {
  participation?: number | null;
  fluency?: number | null;
  vocabulary?: number | null;
  confidence?: number | null;
  pronunciation?: number | null;
  conversation?: number | null;
  comment?: string | null;
  isVisibleToClient?: boolean;
}

export function FeedbackDialog({
  bookingId,
  clientName,
  endpoint = 'admin',
  initial,
  onClose,
  onSaved,
}: {
  bookingId: string;
  clientName: string;
  endpoint?: 'admin' | 'teacher';
  /** Existing feedback to edit */
  initial?: FeedbackValues | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [scores, setScores] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(SKILLS.map((k) => [k, initial?.[k] ?? null])),
  );
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [visible, setVisible] = useState(initial?.isVisibleToClient ?? true);
  const run = useMutation({
    mutationFn: () => {
      const body = { ...scores, comment: comment.trim() || null, isVisibleToClient: visible };
      return endpoint === 'teacher'
        ? call(api.PUT('/api/teacher/bookings/{id}/feedback', { params: { path: { id: bookingId } }, body }))
        : call(api.PUT('/api/admin/bookings/{id}/feedback', { params: { path: { id: bookingId } }, body }));
    },
    onSuccess: () => {
      toast.success('Feedback saved.');
      onSaved?.();
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Feedback for ${clientName}`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={run.isPending} disabled={!comment.trim() && !Object.values(scores).some((v) => v)} onClick={() => run.mutate()}>
            Save feedback
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {SKILLS.map((k) => (
            <div key={k}>
              <p className="mb-1 text-sm font-semibold capitalize">{k}</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScores((s) => ({ ...s, [k]: s[k] === n ? null : n }))}
                    className={cn(
                      'h-9 w-9 rounded-xl border text-sm font-semibold transition',
                      scores[k] && scores[k]! >= n ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white hover:border-brand-300',
                    )}
                    aria-label={`${k} ${n} of 5`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Field label="Comment for the client" htmlFor="fb-comment">
          <Textarea id="fb-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What went well, what to practise next" maxLength={2000} />
        </Field>
        <Checkbox checked={visible} onChange={setVisible} label="Visible to the client in the app" />
        {run.error && <InlineAlert tone="danger">{errorMessage(run.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}
