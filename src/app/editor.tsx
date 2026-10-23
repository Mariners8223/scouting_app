import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CodePrompt } from '@/components/editor/code-prompt';
import { EditorLock } from '@/components/editor/editor-lock';
import { TemplateEditor } from '@/components/editor/template-editor';
import { TemplatesList } from '@/components/editor/templates-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton, Row, SwitchRow } from '@/components/ui/controls';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useSync } from '@/context/sync-context';
import { useTemplates } from '@/context/templates-context';
import { schemaProblems } from '@/form/logic';
import type { FormSchema } from '@/form/types';
import { confirmAction, showMessage } from '@/services/dialogs';
import { publishTemplate } from '@/services/sheets-api';

export default function EditorScreen() {
  const safeArea = useSafeAreaInsets();
  const { loading, templates, active, saveTemplate, markPublished } = useTemplates();
  const { refreshTemplates } = useSync();
  // Stays unlocked until the app restarts or Lock is pressed.
  const [unlocked, setUnlocked] = useState(false);
  // The template being edited is a copy, so nothing changes until Save.
  const [draft, setDraft] = useState<FormSchema>();
  const [publishing, setPublishing] = useState(false);
  const [inUse, setInUse] = useState(true);
  const [checking, setChecking] = useState(false);

  const saved = templates.find((t) => t.id === draft?.id);
  // Publishing or a download only changes publishedVersion, which isn't an edit.
  const content = (t: FormSchema | undefined) => t && JSON.stringify({ ...t, publishedVersion: undefined });
  const dirty = !!draft && content(draft) !== content(saved);

  const open = (template: FormSchema) => setDraft(JSON.parse(JSON.stringify(template)));

  const save = () => {
    if (!draft) return;
    const problems = schemaProblems(draft);
    if (problems.length) {
      showMessage('Can’t save yet', problems.join('\n'));
      return;
    }
    setDraft(saveTemplate(draft));
  };

  const startPublish = () => {
    setInUse(draft?.id === active?.id);
    setPublishing(true);
  };

  /** Sends the saved template to the spreadsheet; every phone picks it up the next time it is online. */
  const publish = async (code: string) => {
    if (!saved) return;
    await publishTemplate(saved, code, inUse);
    markPublished(saved.id, saved.version);
    setPublishing(false);
    showMessage(
      'Published',
      `${saved.name} v${saved.version} goes to every phone the next time it opens with internet.` +
        (inUse ? ' Phones will scout with it.' : ''),
    );
  };

  const checkForUpdates = async () => {
    setChecking(true);
    const ok = await refreshTemplates(true);
    setChecking(false);
    showMessage(ok ? 'Templates are up to date' : 'No connection', ok ? undefined : 'Try again with internet.');
  };

  const close = () => {
    if (!dirty) {
      setDraft(undefined);
      return;
    }
    confirmAction('Discard changes?', 'Your changes to this template were not saved.', 'Discard', () =>
      setDraft(undefined),
    );
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: safeArea.top }]}>
      <Row style={styles.header}>
        {draft ? <AppButton title="‹ Templates" variant="ghost" small onPress={close} /> : null}
        <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={1}>
          {draft ? `${draft.year} · ${draft.name}` : 'Form templates'}
        </ThemedText>
        {draft && dirty ? <AppButton title="Save" variant="primary" small onPress={save} /> : null}
        {draft && !dirty ? (
          <AppButton
            title={saved?.publishedVersion === saved?.version ? 'Published' : 'Publish'}
            variant="primary"
            small
            disabled={saved?.publishedVersion === saved?.version}
            onPress={startPublish}
          />
        ) : null}
        {unlocked && !draft ? (
          <AppButton title={checking ? 'Checking…' : 'Update'} variant="ghost" small disabled={checking} onPress={checkForUpdates} />
        ) : null}
        {unlocked && !draft ? <AppButton title="Lock" variant="ghost" small onPress={() => setUnlocked(false)} /> : null}
      </Row>

      {publishing && saved ? (
        <CodePrompt
          title={`Publish ${saved.year} · ${saved.name} v${saved.version}`}
          message="Every phone downloads this version the next time it is online, and forms can go to its spreadsheet. Enter the editor code to publish."
          confirmText="Publish"
          onConfirm={publish}
          onCancel={() => setPublishing(false)}>
          <SwitchRow label="All phones scout with this form" value={inUse} onChange={setInUse} />
        </CodePrompt>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: safeArea.bottom + BottomTabInset + Spacing.six }]}>
          {!unlocked ? (
            <EditorLock onUnlock={() => setUnlocked(true)} />
          ) : draft ? (
            <TemplateEditor draft={draft} onChange={setDraft} />
          ) : (
            <TemplatesList onEdit={open} />
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexWrap: 'nowrap',
    minHeight: 52,
    paddingHorizontal: Spacing.three,
  },
  content: {
    padding: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
