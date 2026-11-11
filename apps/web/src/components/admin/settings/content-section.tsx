'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, InlineAlert, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Card, SegmentedControl, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/layout';
import { Markdown } from '@/components/ui/markdown';
import { Modal } from '@/components/ui/overlay';
import { toast } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { adminKeys } from '@/lib/admin-queries';
import { fmt } from '@/lib/format';
import type { SettingsGroups } from './settings-form';
import { LOCALE_NAMES, LOCALES, useT, type Locale } from '@/lib/i18n';
import { settingsMessages } from '@/lib/i18n/messages/admin/settings';

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

const contentKey = (locale: Locale) => ['admin', 'settings', 'content', locale] as const;

/**
 * Texts shown in the client app: About, How it works, Rules, FAQ, contact note (Markdown where noted).
 * English is the main version; Russian and Kazakh show the standard translation until they get their own texts.
 */
export function ContentSection({ value }: { value: Content }) {
  const tr = useT(settingsMessages);
  const [language, setLanguage] = useState<Locale>('en');
  return (
    <Card className="space-y-5">
      <div className="space-y-2">
        <SegmentedControl value={language} onChange={setLanguage} options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))} />
        {language === 'en' && <p className="text-sm text-muted">{tr.contentMainHint}</p>}
      </div>
      {language === 'en' ? <MainContent value={value} /> : <TranslatedContent key={language} locale={language} />}
    </Card>
  );
}

function MainContent({ value }: { value: Content }) {
  const tr = useT(settingsMessages);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (draft: Content) => call(api.PATCH('/api/admin/settings/{key}', { params: { path: { key: 'content' } }, body: draft as unknown as Record<string, never> })),
    onSuccess: async (saved) => {
      qc.setQueryData<SettingsGroups>(adminKeys.settings, (all) => (all ? { ...all, content: saved as Record<string, unknown> } : all));
      await Promise.all([qc.invalidateQueries({ queryKey: ['public', 'club'] }), qc.invalidateQueries({ queryKey: ['admin', 'settings', 'content'] })]);
      toast.success(tr.contentSavedClientsSee);
    },
  });
  return <ContentEditor value={value} saving={save.isPending} error={save.error} onSave={(draft) => save.mutate(draft)} />;
}

/** Russian or Kazakh: the standard translation until the first save, then this language's own texts. */
function TranslatedContent({ locale }: { locale: Exclude<Locale, 'en'> }) {
  const tr = useT(settingsMessages);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: contentKey(locale),
    queryFn: () => call(api.GET('/api/admin/settings/content/{locale}', { params: { path: { locale } } })),
  });
  const write = (texts: Content | null) =>
    call(api.PATCH('/api/admin/settings/{key}', { params: { path: { key: 'contentTranslations' } }, body: { [locale]: texts } as unknown as Record<string, never> }));
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: contentKey(locale) }), qc.invalidateQueries({ queryKey: ['public', 'club'] }), qc.invalidateQueries({ queryKey: adminKeys.settings })]);
  const save = useMutation({
    mutationFn: (draft: Content) => write(draft),
    onSuccess: async () => {
      await refresh();
      toast.success(tr.contentSavedClientsSee);
    },
  });
  const reset = useMutation({
    mutationFn: () => write(null),
    onSuccess: async () => {
      await refresh();
      toast.success(tr.contentResetDone);
    },
  });
  if (!data) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted">{data.customized ? tr.contentCustomHint : tr.contentBuiltInHint}</p>
        {data.customized && (
          <Button size="sm" variant="outline" loading={reset.isPending} onClick={() => reset.mutate()}>
            {tr.resetToStandard}
          </Button>
        )}
      </div>
      <ContentEditor value={data.content} saving={save.isPending} error={save.error ?? reset.error} onSave={(draft) => save.mutate(draft)} />
    </div>
  );
}

function ContentEditor({ value, saving, error, onSave }: { value: Content; saving: boolean; error: unknown; onSave: (draft: Content) => void }) {
  const tr = useT(settingsMessages);
  const [draft, setDraft] = useState<Content>(value);
  const [base, setBase] = useState(value);
  if (base !== value) {
    setBase(value);
    setDraft(value);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);

  return (
    <div className="space-y-5">
      <Tabs defaultValue="about">
        <TabsList className="max-w-xl">
          <TabsTrigger value="about">{tr.about}</TabsTrigger>
          <TabsTrigger value="how">{tr.howWorks}</TabsTrigger>
          <TabsTrigger value="rules">{tr.rules}</TabsTrigger>
          <TabsTrigger value="faq">{tr.faq}</TabsTrigger>
          <TabsTrigger value="contact">{tr.contact}</TabsTrigger>
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
                <Input className="h-10" value={step.title} onChange={(e) => setDraft({ ...draft, howItWorks: draft.howItWorks.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)) })} placeholder={tr.stepTitle} aria-label={tr.stepTitleN(i + 1)} />
                <Textarea rows={2} value={step.text} onChange={(e) => setDraft({ ...draft, howItWorks: draft.howItWorks.map((s, j) => (j === i ? { ...s, text: e.target.value } : s)) })} placeholder={tr.shortExplanation} aria-label={tr.stepTextN(i + 1)} />
              </div>
              <ItemControls onUp={() => setDraft({ ...draft, howItWorks: move(draft.howItWorks, i, i - 1) })} onDown={() => setDraft({ ...draft, howItWorks: move(draft.howItWorks, i, i + 1) })} onRemove={() => setDraft({ ...draft, howItWorks: draft.howItWorks.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} disabled={draft.howItWorks.length >= 10} onClick={() => setDraft({ ...draft, howItWorks: [...draft.howItWorks, { title: '', text: '' }] })}>
            {tr.addStep}
          </Button>
        </TabsContent>
        <TabsContent value="faq" className="space-y-3">
          {draft.faq.map((item, i) => (
            <div key={i} className="flex gap-3 rounded-2xl bg-canvas p-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Input className="h-10" value={item.question} onChange={(e) => setDraft({ ...draft, faq: draft.faq.map((s, j) => (j === i ? { ...s, question: e.target.value } : s)) })} placeholder={tr.question} aria-label={tr.questionN(i + 1)} />
                <Textarea rows={3} value={item.answer} onChange={(e) => setDraft({ ...draft, faq: draft.faq.map((s, j) => (j === i ? { ...s, answer: e.target.value } : s)) })} placeholder={tr.answer} aria-label={tr.answerN(i + 1)} />
              </div>
              <ItemControls onUp={() => setDraft({ ...draft, faq: move(draft.faq, i, i - 1) })} onDown={() => setDraft({ ...draft, faq: move(draft.faq, i, i + 1) })} onRemove={() => setDraft({ ...draft, faq: draft.faq.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setDraft({ ...draft, faq: [...draft.faq, { question: '', answer: '' }] })}>
            {tr.addQuestion}
          </Button>
        </TabsContent>
        <TabsContent value="contact">
          <Field label={tr.noteContactPage} htmlFor="ct-note">
            <Textarea id="ct-note" rows={3} value={draft.contactNote} onChange={(e) => setDraft({ ...draft, contactNote: e.target.value })} />
          </Field>
        </TabsContent>
      </Tabs>
      {error ? <InlineAlert tone="danger">{errorMessage(error)}</InlineAlert> : null}
      <div className="flex justify-end gap-2">
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(value)}>
            {tr.discard}
          </Button>
        )}
        <Button loading={saving} disabled={!dirty} onClick={() => onSave(draft)}>
          {tr.saveContent}
        </Button>
      </div>
    </div>
  );
}

function ItemControls({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  const tr = useT(settingsMessages);
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={onUp} className="rounded-lg p-1.5 text-muted hover:bg-white" aria-label={tr.moveUp}>
        <ArrowUp className="h-4 w-4" />
      </button>
      <button type="button" onClick={onDown} className="rounded-lg p-1.5 text-muted hover:bg-white" aria-label={tr.moveDown}>
        <ArrowDown className="h-4 w-4" />
      </button>
      <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-danger-600 hover:bg-white" aria-label={tr.remove}>
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tr = useT(settingsMessages);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Field label={tr.markdown} hint={tr.boldHeadingListLink}>
        <Textarea rows={16} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-sm" />
      </Field>
      <div>
        <p className="mb-1.5 text-sm font-semibold">{tr.preview}</p>
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
  const tr = useT(settingsMessages);
  const [editing, setEditing] = useState<S<'LegalDocumentType'> | null>(null);
  return (
    <div className="space-y-3">
      <InlineAlert tone="warning">{tr.defaultTextsTemplatesHave}</InlineAlert>
      <div className="grid gap-3 lg:grid-cols-3">
        {LEGAL.map((d) => (
          <LegalCard key={d.type} type={d.type} label={tr.legalLabels[d.type] ?? d.label} onEdit={() => setEditing(d.type)} />
        ))}
      </div>
      {editing && <PublishLegalDialog type={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function LegalCard({ type, label, onEdit }: { type: S<'LegalDocumentType'>; label: string; onEdit: () => void }) {
  const tr = useT(settingsMessages);
  const { data } = useQuery({ queryKey: ['admin', 'legal', type], queryFn: () => call(api.GET('/api/admin/legal/{type}/versions', { params: { path: { type } } })) });
  const current = data?.find((d) => d.isCurrent);
  return (
    <Card className="space-y-2">
      <p className="font-semibold">{label}</p>
      {data ? (
        <p className="text-sm text-muted">
          {current ? tr.versionInfo(current.version, fmt.date(current.publishedAt)) : tr.notPublished} · {tr.versionsCount(data.length)}
        </p>
      ) : (
        <Skeleton className="h-4 w-40" />
      )}
      <div className="flex gap-2">
        <Button size="xs" variant="secondary" onClick={onEdit}>
          {tr.publishNewVersion2}
        </Button>
        <a href={`/legal/${type}`} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs font-semibold text-brand-700">
          {tr.view}
        </a>
      </div>
    </Card>
  );
}

function PublishLegalDialog({ type, onClose }: { type: S<'LegalDocumentType'>; onClose: () => void }) {
  const tr = useT(settingsMessages);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'legal', type], queryFn: () => call(api.GET('/api/admin/legal/{type}/versions', { params: { path: { type } } })) });
  const current = data?.find((d) => d.isCurrent);
  const [title, setTitle] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const t = title ?? current?.title ?? (tr.legalLabels[type] ?? LEGAL.find((l) => l.type === type)!.label);
  const c = content ?? current?.content ?? '';
  const publish = useMutation({
    mutationFn: () => call(api.POST('/api/admin/legal', { body: { type, title: t, content: c } })),
    onSuccess: async (doc) => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'legal', type] }), qc.invalidateQueries({ queryKey: ['public', 'legal', type] })]);
      toast.success(tr.versionPublished(doc.version));
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={tr.publishNewVersion}
      description={tr.newRegistrationsPurchasesWill}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.cancel}
          </Button>
          <Button loading={publish.isPending} disabled={!c.trim() || !t.trim()} onClick={() => publish.mutate()}>
            {tr.publish}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Select value={type} disabled aria-label={tr.document} className="h-10">
            {LEGAL.map((l) => (
              <option key={l.type} value={l.type}>
                {tr.legalLabels[l.type] ?? l.label}
              </option>
            ))}
          </Select>
          {current && <Badge>{tr.currentVersion(current.version)}</Badge>}
        </div>
        <Field label={tr.title} htmlFor="lg-title">
          <Input id="lg-title" value={t} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={tr.textMarkdown} htmlFor="lg-content">
          <Textarea id="lg-content" rows={14} value={c} onChange={(e) => setContent(e.target.value)} className="font-mono text-sm" />
        </Field>
        {publish.error && <InlineAlert tone="danger">{errorMessage(publish.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}
