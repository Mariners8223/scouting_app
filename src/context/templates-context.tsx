import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DEFAULT_SCHEMA } from '@/form/default-schema';
import { newId } from '@/form/logic';
import type { Answers, FormSchema, Submission } from '@/form/types';
import { KEYS, loadJson, saveJson } from '@/services/storage';

type TemplatesContextValue = {
  loading: boolean;
  /** Newest season first. */
  templates: FormSchema[];
  /** The template the Scout tab fills in. */
  active: FormSchema | undefined;
  setActive: (id: string) => void;
  /** Returns the saved template with its new version number. */
  saveTemplate: (schema: FormSchema) => FormSchema;
  createTemplate: (options: { name: string; year: number; copyFromId?: string }) => string;
  deleteTemplate: (id: string) => void;
  submissions: Submission[];
  addSubmission: (schema: FormSchema, answers: Answers) => void;
};

const TemplatesContext = createContext<TemplatesContextValue | null>(null);

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const byYear = (a: FormSchema, b: FormSchema) => b.year - a.year || a.name.localeCompare(b.name);

export function TemplatesProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<FormSchema[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  useEffect(() => {
    (async () => {
      const [stored, storedActive, storedSubmissions] = await Promise.all([
        loadJson<FormSchema[]>(KEYS.templates),
        loadJson<string>(KEYS.activeTemplateId),
        loadJson<Submission[]>(KEYS.submissions),
      ]);
      // First launch: start with the built-in season template.
      const initial = stored?.length ? stored : [clone(DEFAULT_SCHEMA)];
      setTemplates(initial.sort(byYear));
      setActiveId(initial.some((t) => t.id === storedActive) ? storedActive! : initial[0].id);
      setSubmissions(storedSubmissions ?? []);
      setLoading(false);
    })();
  }, []);

  const persistTemplates = useCallback((next: FormSchema[]) => {
    const sorted = [...next].sort(byYear);
    setTemplates(sorted);
    saveJson(KEYS.templates, sorted).catch((e) => console.error('Failed to save templates', e));
  }, []);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    saveJson(KEYS.activeTemplateId, id).catch((e) => console.error('Failed to save active template', e));
  }, []);

  const saveTemplate = useCallback(
    (schema: FormSchema) => {
      const saved = { ...schema, version: schema.version + 1, updatedAt: new Date().toISOString() };
      persistTemplates(templates.map((t) => (t.id === schema.id ? saved : t)));
      return saved;
    },
    [templates, persistTemplates],
  );

  const createTemplate = useCallback<TemplatesContextValue['createTemplate']>(
    ({ name, year, copyFromId }) => {
      const source = templates.find((t) => t.id === copyFromId);
      const created: FormSchema = {
        ...(source ? clone(source) : { sections: [{ id: 'info', title: 'Info', questions: [] }] }),
        id: newId('form'),
        name,
        year,
        version: 1,
        updatedAt: new Date().toISOString(),
      };
      persistTemplates([...templates, created]);
      return created.id;
    },
    [templates, persistTemplates],
  );

  const deleteTemplate = useCallback(
    (id: string) => {
      const next = templates.filter((t) => t.id !== id);
      persistTemplates(next);
      if (id === activeId && next.length) setActive(next[0].id);
    },
    [templates, activeId, persistTemplates, setActive],
  );

  const addSubmission = useCallback(
    (schema: FormSchema, answers: Answers) => {
      const submission: Submission = {
        id: newId('sub'),
        createdAt: new Date().toISOString(),
        schemaId: schema.id,
        schemaVersion: schema.version,
        answers,
      };
      const next = [...submissions, submission];
      setSubmissions(next);
      saveJson(KEYS.submissions, next).catch((e) => console.error('Failed to save submission', e));
    },
    [submissions],
  );

  const value = useMemo<TemplatesContextValue>(
    () => ({
      loading,
      templates,
      active: templates.find((t) => t.id === activeId),
      setActive,
      saveTemplate,
      createTemplate,
      deleteTemplate,
      submissions,
      addSubmission,
    }),
    [loading, templates, activeId, setActive, saveTemplate, createTemplate, deleteTemplate, submissions, addSubmission],
  );

  return <TemplatesContext.Provider value={value}>{children}</TemplatesContext.Provider>;
}

export function useTemplates() {
  const context = useContext(TemplatesContext);
  if (!context) throw new Error('useTemplates must be used inside TemplatesProvider');
  return context;
}
