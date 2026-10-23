import * as Network from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useTemplates } from '@/context/templates-context';
import { answerQuestions, answerToString } from '@/form/logic';
import type { FormSchema, Submission } from '@/form/types';
import { sendRows, type SheetRow } from '@/services/sheets-api';

/**
 * Offline-first sync: forms are always saved on the device first, then sent to the
 * spreadsheet whenever there is internet. It retries when the network comes back,
 * when the app is opened again, after every new form and every 30 seconds.
 */

type SyncContextValue = {
  pendingCount: number;
  syncing: boolean;
  lastError: string | undefined;
  lastSyncAt: string | undefined;
  syncNow: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

const RETRY_MS = 30000;
const BASE_COLUMNS = ['submissionId', 'submittedAt', 'template', 'formVersion'];

function toRow(submission: Submission, template: FormSchema | undefined): SheetRow {
  const row: Record<string, string> = {
    submissionId: submission.id,
    submittedAt: submission.createdAt,
    template: template ? `${template.year} ${template.name}` : submission.schemaId,
    formVersion: String(submission.schemaVersion),
  };
  for (const [id, value] of Object.entries(submission.answers)) row[id] = answerToString(value);
  return {
    sheet: submission.sheetName || template?.sheetName || template?.name || 'Scouting',
    columns: [...BASE_COLUMNS, ...(template ? answerQuestions(template).map((q) => q.id) : Object.keys(submission.answers))],
    row,
  };
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { loading, submissions, templates, markSynced } = useTemplates();
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string>();
  const [lastSyncAt, setLastSyncAt] = useState<string>();
  const pending = useMemo(() => submissions.filter((s) => !s.syncedAt), [submissions]);

  // Listeners outlive renders, so they read the latest data through refs.
  const latest = useRef({ pending, templates });
  useEffect(() => {
    latest.current = { pending, templates };
  }, [pending, templates]);
  const busy = useRef(false);

  const syncNow = useCallback(async () => {
    const batch = latest.current.pending;
    if (busy.current || !batch.length) return;
    busy.current = true;
    setSyncing(true);
    try {
      const rows = batch.map((s) => toRow(s, latest.current.templates.find((t) => t.id === s.schemaId)));
      markSynced(await sendRows(rows));
      setLastSyncAt(new Date().toISOString());
      setLastError(undefined);
    } catch (e) {
      // No internet or the spreadsheet didn't answer: the forms stay queued for the next try.
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [markSynced]);

  // New forms, or forms left over from last time. The short delay lets the saved form settle first.
  const pendingCount = pending.length;
  useEffect(() => {
    if (loading || pendingCount === 0) return;
    const timer = setTimeout(syncNow, 500);
    return () => clearTimeout(timer);
  }, [loading, pendingCount, syncNow]);

  useEffect(() => {
    const network = Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) syncNow();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncNow();
    });
    const timer = setInterval(syncNow, RETRY_MS);
    return () => {
      network.remove();
      appState.remove();
      clearInterval(timer);
    };
  }, [syncNow]);

  const value = useMemo(
    () => ({ pendingCount, syncing, lastError, lastSyncAt, syncNow }),
    [pendingCount, syncing, lastError, lastSyncAt, syncNow],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used inside SyncProvider');
  return context;
}
