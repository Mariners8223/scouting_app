import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EditorLock } from '@/components/editor/editor-lock';
import { TemplateEditor } from '@/components/editor/template-editor';
import { TemplatesList } from '@/components/editor/templates-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton, Row } from '@/components/ui/controls';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTemplates } from '@/context/templates-context';
import { schemaProblems } from '@/form/logic';
import type { FormSchema } from '@/form/types';
import { confirmAction, showMessage } from '@/services/dialogs';

export default function EditorScreen() {
  const safeArea = useSafeAreaInsets();
  const { loading, templates, saveTemplate } = useTemplates();
  // Stays unlocked until the app restarts or Lock is pressed.
  const [unlocked, setUnlocked] = useState(false);
  // The template being edited is a copy, so nothing changes until Save.
  const [draft, setDraft] = useState<FormSchema>();

  const saved = templates.find((t) => t.id === draft?.id);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);

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
        {draft ? <AppButton title={dirty ? 'Save' : 'Saved'} variant="primary" small disabled={!dirty} onPress={save} /> : null}
        {unlocked && !draft ? <AppButton title="Lock" variant="ghost" small onPress={() => setUnlocked(false)} /> : null}
      </Row>

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
