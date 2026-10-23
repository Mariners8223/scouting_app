import * as Network from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useTemplates } from '@/context/templates-context';
import { toSheetRow } from '@/form/sheet-row';
import { fetchPublished, sendRows } from '@/services/sheets-api';

/**
 * Offline-first sync: forms are always saved on the device first, then sent to the
 * spreadsheet whenever there is internet. It retries when the network comes back,
 * when the app is opened again, after every new form and every 30 seconds.
 * The same moments also download the templates published for all phones (at most every few minutes).
 */

type SyncContextValue = {
  pendingCount: number;
  syncing: boolean;
  lastError: string | undefined;
  lastSyncAt: string | undefined;
  syncNow: () => Promise<void>;
  /** Downloads the published templates; `force` skips the wait between checks. Resolves false when offline. */
  refreshTemplates: (force?: boolean) => Promise<boolean>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

const RETRY_MS = 30000;
const TEMPLATE_CHECK_MS = 5 * 60 * 1000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { loading, submissions, templates, markSynced, applyPublished } = useTemplates();
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
      const rows = batch.map((s) => toSheetRow(s, latest.current.templates.find((t) => t.id === s.schemaId)));
      const { saved, errors } = await sendRows(rows);
      markSynced(saved);
      setLastSyncAt(new Date().toISOString());
      // Refused forms (e.g. their template isn't published yet) stay queued and the reason is shown.
      setLastError(errors[0]?.error);
    } catch (e) {
      // No internet or the spreadsheet didn't answer: the forms stay queued for the next try.
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [markSynced]);

  const lastTemplateCheck = useRef(0);
  const refreshTemplates = useCallback(
    async (force = false) => {
      if (!force && Date.now() - lastTemplateCheck.current < TEMPLATE_CHECK_MS) return true;
      lastTemplateCheck.current = Date.now();
      try {
        const { templates: published, inUseId } = await fetchPublished();
        applyPublished(published, inUseId);
        return true;
      } catch (e) {
        lastTemplateCheck.current = 0; // try again at the next chance
        console.warn('Could not download templates', e);
        return false;
      }
    },
    [applyPublished],
  );

  useEffect(() => {
    if (!loading) refreshTemplates();
  }, [loading, refreshTemplates]);

  // New forms, or forms left over from last time. The short delay lets the saved form settle first.
  const pendingCount = pending.length;
  useEffect(() => {
    if (loading || pendingCount === 0) return;
    const timer = setTimeout(syncNow, 500);
    return () => clearTimeout(timer);
  }, [loading, pendingCount, syncNow]);

  useEffect(() => {
    const network = Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        syncNow();
        refreshTemplates();
      }
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncNow();
        refreshTemplates();
      }
    });
    const timer = setInterval(() => {
      syncNow();
      refreshTemplates();
    }, RETRY_MS);
    return () => {
      network.remove();
      appState.remove();
      clearInterval(timer);
    };
  }, [syncNow, refreshTemplates]);

  const value = useMemo(
    () => ({ pendingCount, syncing, lastError, lastSyncAt, syncNow, refreshTemplates }),
    [pendingCount, syncing, lastError, lastSyncAt, syncNow, refreshTemplates],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used inside SyncProvider');
  return context;
}
