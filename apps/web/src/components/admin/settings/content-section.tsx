'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, InlineAlert, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/layout';
import { Markdown } from '@/components/ui/markdown';
import { Modal } from '@/components/ui/overlay';
import { toast } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { adminKeys } from '@/lib/admin-queries';
import { fmt } from '@/lib/format';
import type { SettingsGroups } from './settings-form';

interface Content {
  about: string;
  howItWorks: Array<{ title: string; text: string }>;
  rules: string;
  faq: Array<{ question: string; answer: string }>;
  contactNote: string;
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Texts shown in the client app: About, How it works, Rules, FAQ, contact note (Markdown where noted). */
export function ContentSection({ value }: { value: Content }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Content>(value);
  const [base, setBase] = useState(value);
  if (base !== value) {
    setBase(value);
    setDraft(value);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const save = useMutation({
    mutationFn: () => call(api.PATCH('/api/admin/settings/{key}', { params: { path: { key: 'content' } }, body: draft as unknown as Record<string, never> })),
    onSuccess: async (saved) => {
      qc.setQueryData<SettingsGroups>(adminKeys.settings, (all) => (all ? { ...all, content: saved as Record<string, unknown> } : all));
      await qc.invalidateQueries({ queryKey: ['public', 'club'] });
      toast.success('Content saved — clients see it right away.');
    },
  });

  return (
    <Card className="space-y-5">
      <Tabs defaultValue="about">
        <TabsList className="max-w-xl">
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="how">How it works</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
        </TabsList>
        <TabsContent value="about">
          <MarkdownEditor value={draft.about} onChange={(about) => setDraft({ ...draft, about })} />
        </TabsContent>
        <TabsContent value="rules">
          <MarkdownEditor value={draft.rules} onChange={(rules) => setDraft({ ...draft, rules })} />
        </TabsContent>
        <TabsContent value="how" className="space-y-3">
          {draft.howItWorks.map((step, i) => (
            <div key={i} className="flex gap-3 rounded-2xl bg-canvas p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-sm font-semibold text-white">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <Input className="h-10" value={step.title} onChange={(e) => setDraft({ ...draft, howItWorks: draft.howItWorks.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)) })} placeholder="Step title" aria-label={`Step ${i + 1} title`} />
                <Textarea rows={2} value={step.text} onChange={(e) => setDraft({ ...draft, howItWorks: draft.howItWorks.map((s, j) => (j === i ? { ...s, text: e.target.value } : s)) })} placeholder="Short explanation" aria-label={`Step ${i + 1} text`} />
              </div>
              <ItemControls onUp={() => setDraft({ ...draft, howItWorks: move(draft.howItWorks, i, i - 1) })} onDown={() => setDraft({ ...draft, howItWorks: move(draft.howItWorks, i, i + 1) })} onRemove={() => setDraft({ ...draft, howItWorks: draft.howItWorks.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} disabled={draft.howItWorks.length >= 10} onClick={() => setDraft({ ...draft, howItWorks: [...draft.howItWorks, { title: '', text: '' }] })}>
            Add step
          </Button>
        </TabsContent>
        <TabsContent value="faq" className="space-y-3">
          {draft.faq.map((item, i) => (
            <div key={i} className="flex gap-3 rounded-2xl bg-canvas p-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Input className="h-10" value={item.question} onChange={(e) => setDraft({ ...draft, faq: draft.faq.map((s, j) => (j === i ? { ...s, question: e.target.value } : s)) })} placeholder="Question" aria-label={`Question ${i + 1}`} />
                <Textarea rows={3} value={item.answer} onChange={(e) => setDraft({ ...draft, faq: draft.faq.map((s, j) => (j === i ? { ...s, answer: e.target.value } : s)) })} placeholder="Answer" aria-label={`Answer ${i + 1}`} />
              </div>
              <ItemControls onUp={() => setDraft({ ...draft, faq: move(draft.faq, i, i - 1) })} onDown={() => setDraft({ ...draft, faq: move(draft.faq, i, i + 1) })} onRemove={() => setDraft({ ...draft, faq: draft.faq.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setDraft({ ...draft, faq: [...draft.faq, { question: '', answer: '' }] })}>
            Add question
          </Button>
        </TabsContent>
        <TabsContent value="contact">
          <Field label="Note on the Contact page" htmlFor="ct-note">
            <Textarea id="ct-note" rows={3} value={draft.contactNote} onChange={(e) => setDraft({ ...draft, contactNote: e.target.value })} />
          </Field>
        </TabsContent>
      </Tabs>
      {save.error && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      <div className="flex justify-end gap-2">
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(value)}>
            Discard
          </Button>
        )}
        <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
          Save content
        </Button>
      </div>
    </Card>
  );
}

function ItemControls({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={onUp} className="rounded-lg p-1.5 text-muted hover:bg-white" aria-label="Move up">
        <ArrowUp className="h-4 w-4" />
      </button>
      <button type="button" onClick={onDown} className="rounded-lg p-1.5 text-muted hover:bg-white" aria-label="Move down">
        <ArrowDown className="h-4 w-4" />
      </button>
      <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-danger-600 hover:bg-white" aria-label="Remove">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Field label="Markdown" hint="**bold**, ### heading, - list, [link](https://…)">
        <Textarea rows={16} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-sm" />
      </Field>
      <div>
        <p className="mb-1.5 text-sm font-semibold">Preview</p>
        <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-line p-4">
          <Markdown>{value || '_Nothing yet_'}</Markdown>
        </div>
      </div>
    </div>
  );
}

const LEGAL: Array<{ type: S<'LegalDocumentType'>; label: string }> = [
  { type: 'TERMS', label: 'Terms of Use' },
  { type: 'PRIVACY_POLICY', label: 'Privacy Policy' },
  { type: 'PUBLIC_OFFER', label: 'Public Offer' },
];

/** Versioned legal texts. Publishing a new version keeps the old ones and every client's acceptance record. */
export function LegalSection() {
  const [editing, setEditing] = useState<S<'LegalDocumentType'> | null>(null);
  return (
    <div className="space-y-3">
      <InlineAlert tone="warning">The default texts are templates — have them reviewed by a lawyer before going live.</InlineAlert>
      <div className="grid gap-3 lg:grid-cols-3">
        {LEGAL.map((d) => (
          <LegalCard key={d.type} type={d.type} label={d.label} onEdit={() => setEditing(d.type)} />
        ))}
      </div>
      {editing && <PublishLegalDialog type={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function LegalCard({ type, label, onEdit }: { type: S<'LegalDocumentType'>; label: string; onEdit: () => void }) {
  const { data } = useQuery({ queryKey: ['admin', 'legal', type], queryFn: () => call(api.GET('/api/admin/legal/{type}/versions', { params: { path: { type } } })) });
  const current = data?.find((d) => d.isCurrent);
  return (
    <Card className="space-y-2">
      <p className="font-semibold">{label}</p>
      {data ? (
        <p className="text-sm text-muted">
          {current ? `Version ${current.version} · published ${fmt.date(current.publishedAt)}` : 'Not published'} · {data.length} version{data.length === 1 ? '' : 's'}
        </p>
      ) : (
        <Skeleton className="h-4 w-40" />
      )}
      <div className="flex gap-2">
        <Button size="xs" variant="secondary" onClick={onEdit}>
          Publish new version
        </Button>
        <a href={`/legal/${type}`} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs font-semibold text-brand-700">
          View
        </a>
      </div>
    </Card>
  );
}

function PublishLegalDialog({ type, onClose }: { type: S<'LegalDocumentType'>; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'legal', type], queryFn: () => call(api.GET('/api/admin/legal/{type}/versions', { params: { path: { type } } })) });
  const current = data?.find((d) => d.isCurrent);
  const [title, setTitle] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const t = title ?? current?.title ?? LEGAL.find((l) => l.type === type)!.label;
  const c = content ?? current?.content ?? '';
  const publish = useMutation({
    mutationFn: () => call(api.POST('/api/admin/legal', { body: { type, title: t, content: c } })),
    onSuccess: async (doc) => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'legal', type] }), qc.invalidateQueries({ queryKey: ['public', 'legal', type] })]);
      toast.success(`Version ${doc.version} published.`);
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Publish a new version"
      description="New registrations and purchases will accept this version. Earlier acceptances stay recorded."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={publish.isPending} disabled={!c.trim() || !t.trim()} onClick={() => publish.mutate()}>
            Publish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Select value={type} disabled aria-label="Document" className="h-10">
            {LEGAL.map((l) => (
              <option key={l.type} value={l.type}>
                {l.label}
              </option>
            ))}
          </Select>
          {current && <Badge>current v{current.version}</Badge>}
        </div>
        <Field label="Title" htmlFor="lg-title">
          <Input id="lg-title" value={t} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Text (Markdown)" htmlFor="lg-content">
          <Textarea id="lg-content" rows={14} value={c} onChange={(e) => setContent(e.target.value)} className="font-mono text-sm" />
        </Field>
        {publish.error && <InlineAlert tone="danger">{errorMessage(publish.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}
