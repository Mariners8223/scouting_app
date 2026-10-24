import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { DEFAULT_SCHEMA } from '@/form/default-schema';
import { newId, newKey, schemaProblems } from '@/form/logic';
import type { Answers, FormSchema, Submission } from '@/form/types';
import { KEYS, loadJson, requestPersistentStorage, saveJson } from '@/services/storage';

type TemplatesContextValue = {
  loading: boolean;
  /** Newest season first. */
  templates: FormSchema[];
  /** The template the Scout tab fills in. */
  active: FormSchema | undefined;
  setActive: (id: string) => void;
  /** Returns the saved template with its new version number. */
  saveTemplate: (schema: FormSchema) => FormSchema;
  createTemplate: (options: { name: string; year: number; copyFromId?: string }) => FormSchema;
  deleteTemplate: (id: string) => void;
  /** Records that this version is now the one on all phones. */
  markPublished: (id: string, version: number) => void;
  /** Takes in the templates published for all phones; newer versions replace the ones on this device. Returns the names of the ones that changed. */
  applyPublished: (published: FormSchema[], inUseId: string | undefined) => string[];
  /** Every saved form on this device, sent or not. */
  submissions: Submission[];
  /** Saves a finished form and returns it (with its key). */
  addSubmission: (schema: FormSchema, answers: Answers) => Submission;
  /** Called by the sync once the spreadsheet confirmed these forms. */
  markSynced: (ids: string[]) => void;
};

const TemplatesContext = createContext<TemplatesContextValue | null>(null);

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const byYear = (a: FormSchema, b: FormSchema) => b.year - a.year || a.name.localeCompare(b.name);

export function TemplatesProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<FormSchema[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  // Saving a form and the background sync can both change submissions (and the download can change
  // templates while the editor saves); the refs keep them from overwriting each other.
  const submissionsRef = useRef<Submission[]>([]);
  const templatesRef = useRef<FormSchema[]>([]);

  useEffect(() => {
    requestPersistentStorage();
    (async () => {
      const [stored, storedActive, storedSubmissions] = await Promise.all([
        loadJson<FormSchema[]>(KEYS.templates),
        loadJson<string>(KEYS.activeTemplateId),
        loadJson<Submission[]>(KEYS.submissions),
      ]);
      // First launch: start with the built-in season template. A built-in copy nobody saved
      // in the editor yet (still version 1) is replaced by the app's newest version of it.
      const initial = stored?.length
        ? stored.map((t) => (t.id === DEFAULT_SCHEMA.id && t.version === 1 ? clone(DEFAULT_SCHEMA) : t))
        : [clone(DEFAULT_SCHEMA)];
      templatesRef.current = initial.sort(byYear);
      setTemplates(templatesRef.current);
      if (initial.some((t) => t.id === storedActive)) {
        setActiveId(storedActive!);
      } else {
        // Remember the fallback, so adding a newer template later doesn't silently switch scouting to it.
        setActiveId(initial[0].id);
        saveJson(KEYS.activeTemplateId, initial[0].id).catch((e) => console.error('Failed to save active template', e));
      }
      submissionsRef.current = storedSubmissions ?? [];
      setSubmissions(submissionsRef.current);
      setLoading(false);
    })();
  }, []);

  const updateTemplates = useCallback((change: (current: FormSchema[]) => FormSchema[]) => {
    const sorted = [...change(templatesRef.current)].sort(byYear);
    templatesRef.current = sorted;
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
      updateTemplates((current) => current.map((t) => (t.id === schema.id ? saved : t)));
      return saved;
    },
    [updateTemplates],
  );

  const createTemplate = useCallback<TemplatesContextValue['createTemplate']>(
    ({ name, year, copyFromId }) => {
      const source = templatesRef.current.find((t) => t.id === copyFromId);
      const created: FormSchema = {
        ...(source ? clone(source) : { sections: [{ id: 'info', title: 'Info', questions: [] }] }),
        id: newId('form'),
        name,
        year,
        version: 1,
        publishedVersion: undefined,
        downloadedVersion: undefined,
        updatedAt: new Date().toISOString(),
      };
      updateTemplates((current) => [...current, created]);
      return created;
    },
    [updateTemplates],
  );

  const deleteTemplate = useCallback(
    (id: string) => {
      updateTemplates((current) => current.filter((t) => t.id !== id));
      const next = templatesRef.current;
      if (id === activeId && next.length) setActive(next[0].id);
    },
    [activeId, updateTemplates, setActive],
  );

  const markPublished = useCallback(
    (id: string, version: number) =>
      updateTemplates((current) => current.map((t) => (t.id === id ? { ...t, publishedVersion: version, downloadedVersion: version } : t))),
    [updateTemplates],
  );

  const applyPublished = useCallback(
    (published: FormSchema[], inUseId: string | undefined) => {
      // A broken download never replaces a working template.
      const usable = published.filter((p) => p?.id && Array.isArray(p.sections) && !schemaProblems(p).length);
      const current = templatesRef.current;
      // Each publish replaces the phone's copy, whatever was edited on the phone: the published form
      // is the one everybody scouts with. Edits made on a phone after it got a version stay until the next publish.
      // downloadedVersion (not publishedVersion, which older app versions also set on copies they kept) says
      // which published version the copy really is.
      const newer = usable.filter((p) => current.find((t) => t.id === p.id)?.downloadedVersion !== p.version);
      const changed = newer.map((p) => `${p.year} · ${p.name}`);
      if (newer.length) {
        updateTemplates((list) => {
          const next = [...list];
          for (const p of newer) {
            const at = next.findIndex((t) => t.id === p.id);
            const merged = { ...p, publishedVersion: p.version, downloadedVersion: p.version };
            if (at >= 0) next[at] = merged;
            else next.push(merged);
          }
          return next;
        });
      }
      // Switch scouting to the template marked "in use", once per change, so a scouter can still pick another one.
      if (inUseId && templatesRef.current.some((t) => t.id === inUseId)) {
        loadJson<string>(KEYS.publishedInUseId).then((applied) => {
          if (applied === inUseId) return;
          setActive(inUseId);
          saveJson(KEYS.publishedInUseId, inUseId).catch((e) => console.error('Failed to save in-use template', e));
        });
      }
      return changed;
    },
    [updateTemplates, setActive],
  );

  const updateSubmissions = useCallback((change: (current: Submission[]) => Submission[]) => {
    const next = change(submissionsRef.current);
    submissionsRef.current = next;
    setSubmissions(next);
    saveJson(KEYS.submissions, next).catch((e) => console.error('Failed to save submissions', e));
  }, []);

  const addSubmission = useCallback(
    (schema: FormSchema, answers: Answers) => {
      const taken = new Set(submissionsRef.current.map((s) => s.id));
      let id = newKey();
      while (taken.has(id)) id = newKey();
      const submission: Submission = {
        id,
        createdAt: new Date().toISOString(),
        schemaId: schema.id,
        schemaVersion: schema.version,
        spreadsheetId: schema.spreadsheetId,
        sheetName: schema.sheetName || schema.name,
        answers,
      };
      updateSubmissions((current) => [...current, submission]);
      return submission;
    },
    [updateSubmissions],
  );

  const markSynced = useCallback(
    (ids: string[]) => {
      const done = new Set(ids);
      const at = new Date().toISOString();
      updateSubmissions((current) => current.map((s) => (done.has(s.id) && !s.syncedAt ? { ...s, syncedAt: at } : s)));
    },
    [updateSubmissions],
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
      markPublished,
      applyPublished,
      submissions,
      addSubmission,
      markSynced,
    }),
    [
      loading,
      templates,
      activeId,
      setActive,
      saveTemplate,
      createTemplate,
      deleteTemplate,
      markPublished,
      applyPublished,
      submissions,
      addSubmission,
      markSynced,
    ],
  );

  return <TemplatesContext.Provider value={value}>{children}</TemplatesContext.Provider>;
}

export function useTemplates() {
  const context = useContext(TemplatesContext);
  if (!context) throw new Error('useTemplates must be used inside TemplatesProvider');
  return context;
}
