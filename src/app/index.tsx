import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OpenForm } from '@/components/form/open-form';
import { QuestionField } from '@/components/form/question-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton, ChoiceButtons, Row } from '@/components/ui/controls';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useSync } from '@/context/sync-context';
import { useTemplates } from '@/context/templates-context';
import {
  answerQuestions,
  effectiveAnswer,
  isAnswered,
  isEmpty,
  missingBySection,
  orderedSections,
  visibleAnswers,
  visibleQuestions,
} from '@/form/logic';
import type { Answers, FormSchema } from '@/form/types';
import { useTheme } from '@/hooks/use-theme';
import { KEYS, loadJson, saveJson } from '@/services/storage';
import { confirmAction, showMessage } from '@/services/dialogs';

type Draft = { schemaId: string; answers: Answers };

const templateLabel = (t: FormSchema) => `${t.year} · ${t.name}`;

export default function ScoutScreen() {
  useKeepAwake(); // Stops the screen from sleeping while scouting

  const theme = useTheme();
  const safeArea = useSafeAreaInsets();
  const { loading, active, templates, setActive, addSubmission, submissions } = useTemplates();
  const [picking, setPicking] = useState(false);
  const [opening, setOpening] = useState(false);
  const { pendingCount, syncing, syncNow, lastError } = useSync();
  const [answers, setAnswers] = useState<Answers>({});
  const [tabId, setTabId] = useState<string>();
  const [showMissing, setShowMissing] = useState(false);
  /** Which template the answers belong to; the form waits until it matches the active one. */
  const [loadedFor, setLoadedFor] = useState<string>();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const activeId = active?.id;
  const draftLoaded = !!activeId && loadedFor === activeId;

  // Restore an unfinished form (e.g. after the app was closed mid-match).
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    loadJson<Draft>(KEYS.draft).then((draft) => {
      if (cancelled) return;
      setAnswers(draft?.schemaId === activeId ? draft.answers : {});
      setTabId(undefined);
      setShowMissing(false);
      setLoadedFor(activeId);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  if (loading || !draftLoaded || !active) {
    return (
      <ThemedView style={styles.center}>
        {loading || active ? (
          <ActivityIndicator />
        ) : (
          <ThemedText>No form template yet. Create one in the Form Editor tab.</ThemedText>
        )}
      </ThemedView>
    );
  }

  const sections = orderedSections(active, answers);
  if (!sections.length) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>This template has no tabs yet. Add some in the Form Editor tab.</ThemedText>
      </ThemedView>
    );
  }

  const index = Math.max(0, sections.findIndex((s) => s.id === tabId));
  const section = sections[index];
  const missing = missingBySection(active, answers);
  const missingSectionIds = new Set(missing.map((m) => m.section.id));
  const savedHere = submissions.filter((s) => s.schemaId === active.id).length;

  const updateAnswers = (next: Answers) => {
    setAnswers(next);
    saveJson(KEYS.draft, { schemaId: active.id, answers: next } satisfies Draft).catch((e) =>
      console.error('Failed to save draft', e),
    );
  };

  const goTo = (id: string) => {
    setTabId(id);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  /** Empties the form but keeps answers marked "keep after submit" (match number goes up after a save). */
  const resetForm = (advance: boolean) => {
    const kept: Answers = {};
    for (const q of answerQuestions(active)) {
      if (!q.keepAfterSubmit) continue;
      const value = effectiveAnswer(q, answers);
      kept[q.id] = advance && q.type === 'number' && typeof value === 'number' ? value + (q.step || 1) : value;
    }
    updateAnswers(kept);
    setShowMissing(false);
    goTo(sections[0].id);
  };

  const submit = () => {
    if (missing.length) {
      setShowMissing(true);
      goTo(missing[0].section.id);
      showMessage(
        'Some answers are missing',
        missing.map((m) => `${m.section.title}: ${m.questions.length}`).join('\n'),
      );
      return;
    }
    const saved = addSubmission(active, visibleAnswers(active, answers));
    resetForm(true);
    showMessage(
      `Saved · key ${saved.id}`,
      'Saved on this device. It is sent to the spreadsheet as soon as there is internet. Open it again any time with Open and this key.',
    );
  };

  const clear = () =>
    confirmAction('Clear form?', 'All answers in this form will be deleted.', 'Clear', () => resetForm(false));

  /** Changing the template needs no editor code; it only discards the form in progress. */
  const switchTemplate = (id: string) => {
    if (id === active.id) {
      setPicking(false);
      return;
    }
    const hasProgress = answerQuestions(active).some((q) => !q.keepAfterSubmit && !isEmpty(answers[q.id]));
    const doSwitch = () => {
      setPicking(false);
      setActive(id);
    };
    if (!hasProgress) {
      doSwitch();
      return;
    }
    confirmAction('Switch template?', 'The answers in the current form will be deleted.', 'Switch', doSwitch);
  };

  const isLast = index === sections.length - 1;

  return (
    <ThemedView style={[styles.container, { paddingTop: safeArea.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold">{active.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {active.year} · {savedHere} saved on this device
          </ThemedText>
          <Pressable accessibilityRole="button" onPress={syncNow} disabled={syncing || pendingCount === 0}>
            <ThemedText type="smallBold" style={{ color: pendingCount ? theme.danger : theme.accent }}>
              {syncing
                ? `Sending ${pendingCount}…`
                : pendingCount
                  ? `${pendingCount} waiting for internet · tap to send`
                  : 'All forms sent ✓'}
            </ThemedText>
            {pendingCount && lastError ? (
              <ThemedText type="small" style={{ color: theme.danger }} numberOfLines={2}>
                {lastError}
              </ThemedText>
            ) : null}
          </Pressable>
        </View>
        <AppButton title="Open" variant="ghost" small onPress={() => setOpening(true)} />
        {templates.length > 1 ? (
          <AppButton title="Switch" variant="ghost" small onPress={() => setPicking(true)} />
        ) : null}
        <AppButton title="Clear" variant="ghost" small onPress={clear} />
      </View>

      {opening ? <OpenForm onClose={() => setOpening(false)} /> : null}

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(false)}>
          <Pressable style={[styles.picker, { backgroundColor: theme.background }]}>
            <ThemedText type="smallBold">Scout with template</ThemedText>
            <ChoiceButtons
              vertical
              options={templates.map(templateLabel)}
              selected={[templateLabel(active)]}
              onSelect={(option) => {
                const chosen = templates.find((t) => templateLabel(t) === option);
                if (chosen) switchTemplate(chosen.id);
              }}
            />
            <AppButton title="Cancel" onPress={() => setPicking(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}>
        {sections.map((s) => {
          const selected = s.id === section.id;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => goTo(s.id)}
              style={[styles.tab, { backgroundColor: selected ? theme.accent : theme.backgroundElement }]}>
              <ThemedText type="smallBold" style={{ color: selected ? theme.onAccent : theme.text }}>
                {s.title}
              </ThemedText>
              {showMissing && missingSectionIds.has(s.id) ? (
                <View style={[styles.dot, { backgroundColor: theme.danger }]} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {visibleQuestions(section, answers).map((q) => (
          <QuestionField
            key={q.id}
            question={q}
            answers={answers}
            onChange={(value) => updateAnswers({ ...answers, [q.id]: value })}
            showMissing={showMissing && !isAnswered(q, answers)}
          />
        ))}
      </ScrollView>

      <Row style={[styles.footer, { paddingBottom: safeArea.bottom + BottomTabInset + Spacing.two }]}>
        <AppButton
          title="Prev"
          disabled={index === 0}
          onPress={() => goTo(sections[index - 1].id)}
          style={{ flex: 1 }}
        />
        {isLast ? (
          <AppButton title="Save" variant="primary" onPress={submit} style={{ flex: 2 }} />
        ) : (
          <AppButton title="Next" variant="primary" onPress={() => goTo(sections[index + 1].id)} style={{ flex: 2 }} />
        )}
      </Row>
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
    padding: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  tabsScroll: {
    flexGrow: 0,
  },
  tabs: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  picker: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  footer: {
    flexWrap: 'nowrap',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
});
