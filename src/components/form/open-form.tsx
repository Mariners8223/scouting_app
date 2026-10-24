import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton, Card, LabeledInput, Row } from '@/components/ui/controls';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTemplates } from '@/context/templates-context';
import { answerToString, interpolate, orderedSections, sectionTitles, visibleQuestions } from '@/form/logic';
import { answersFromRow, KEY_NAME, sheetNameOf } from '@/form/sheet-row';
import type { Answers, FormSchema, Submission } from '@/form/types';
import { useTheme } from '@/hooks/use-theme';
import { findRow, type FindTarget } from '@/services/sheets-api';

/** A form opened by key: from this phone, or read back from the spreadsheet. */
type Opened = {
  key: string;
  template: FormSchema | undefined;
  answers: Answers;
  source: string;
};

const RECENT = 15;

/** Looks up a saved form by its key (the 8 letters shown after saving, column A in the sheet) and shows its answers. */
export function OpenForm({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const safeArea = useSafeAreaInsets();
  const { templates, submissions } = useTemplates();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [opened, setOpened] = useState<Opened>();

  const templateOf = (s: Submission) => templates.find((t) => t.id === s.schemaId);
  const recent = [...submissions].reverse().slice(0, RECENT);

  const openLocal = (s: Submission) =>
    setOpened({
      key: s.id,
      template: templateOf(s),
      answers: s.answers,
      source: `Saved on this phone ${new Date(s.createdAt).toLocaleString()} · ${s.syncedAt ? 'sent to the sheet' : 'not sent yet'}`,
    });

  const open = async () => {
    const wanted = key.trim().toLowerCase();
    if (!wanted || busy) return;
    setError(undefined);
    const local = submissions.find((s) => s.id.toLowerCase() === wanted);
    if (local) {
      openLocal(local);
      return;
    }
    // Every place a template on this phone writes to, once each.
    const targets: FindTarget[] = [];
    const owners: FormSchema[] = [];
    for (const t of templates) {
      const target = t.columnLayout
        ? { spreadsheetId: t.spreadsheetId, sheet: sheetNameOf(t), keyColumn: t.columnLayout.key }
        : { spreadsheetId: t.spreadsheetId, sheet: sheetNameOf(t), keyName: KEY_NAME };
      if (targets.some((x) => JSON.stringify(x) === JSON.stringify(target))) continue;
      targets.push(target);
      owners.push(t);
    }
    setBusy(true);
    try {
      const result = await findRow(wanted, targets);
      if (!result.found || result.target === undefined) {
        setError('No form with this key, on this phone or in the spreadsheet.');
        return;
      }
      const template = owners[result.target];
      setOpened({
        key: wanted,
        template,
        answers: answersFromRow(template, result.headers ?? [], result.values ?? [], result.named),
        source: `From the spreadsheet, tab “${sheetNameOf(template)}”`,
      });
    } catch (e) {
      setError(`Couldn’t reach the spreadsheet (${e instanceof Error ? e.message : String(e)}). Forms saved on this phone still open without internet.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={[styles.container, { paddingTop: safeArea.top || Spacing.three }]}>
        <Row style={styles.header}>
          {opened ? <AppButton title="‹ Back" variant="ghost" small onPress={() => setOpened(undefined)} /> : null}
          <ThemedText type="smallBold" style={{ flex: 1, textAlign: 'center' }}>
            {opened ? `Form ${opened.key}` : 'Open a form'}
          </ThemedText>
          <AppButton title="Close" variant="ghost" small onPress={onClose} />
        </Row>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: safeArea.bottom + Spacing.six }]}>
          {opened ? (
            <FormAnswers opened={opened} />
          ) : (
            <>
              <Card title="Key">
                <LabeledInput
                  value={key}
                  onChangeText={(text) => {
                    setKey(text);
                    setError(undefined);
                  }}
                  onSubmitEditing={open}
                  placeholder="e.g. k7f3x9q2"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {error ? (
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    {error}
                  </ThemedText>
                ) : null}
                <AppButton title={busy ? 'Looking…' : 'Open'} variant="primary" disabled={!key.trim() || busy} onPress={open} />
              </Card>

              {recent.length ? (
                <Card title="Saved on this phone">
                  {recent.map((s) => (
                    <Pressable
                      key={s.id}
                      accessibilityRole="button"
                      onPress={() => openLocal(s)}
                      style={({ pressed }) => [styles.recent, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
                      <ThemedText type="smallBold">{s.id}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                        {summary(s)}
                      </ThemedText>
                      <ThemedText type="small" style={{ color: s.syncedAt ? theme.accent : theme.danger }}>
                        {s.syncedAt ? 'sent' : 'waiting'}
                      </ThemedText>
                    </Pressable>
                  ))}
                </Card>
              ) : null}
            </>
          )}
        </ScrollView>
      </ThemedView>
    </Modal>
  );
}

/** "Team 8223 · match 12" when the form has those answers. */
function summary(s: Submission) {
  const parts = [];
  if (s.answers.team !== undefined) parts.push(`Team ${answerToString(s.answers.team)}`);
  if (s.answers.match !== undefined) parts.push(`match ${answerToString(s.answers.match)}`);
  return parts.join(' · ') || new Date(s.createdAt).toLocaleString();
}

/** Read-only answers, tab by tab, in the order the scouter saw them. */
function FormAnswers({ opened }: { opened: Opened }) {
  const { template, answers } = opened;
  const titles = template ? sectionTitles(template, answers) : undefined;
  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        {opened.source}
        {template ? ` · ${template.year} ${template.name}` : ''}
      </ThemedText>
      {template ? (
        orderedSections(template, answers).map((section) => (
          <Card key={section.id} title={titles?.get(section.id)}>
            {visibleQuestions(section, answers).map((q) =>
              q.type === 'header' ? (
                <ThemedText key={q.id} type="smallBold">
                  {interpolate(q.label, answers)}
                </ThemedText>
              ) : (
                <AnswerLine key={q.id} label={interpolate(q.label, answers)} value={answerToString(answers[q.id])} />
              ),
            )}
          </Card>
        ))
      ) : (
        // The template isn't on this phone any more: show the raw answers.
        <Card title="Answers">
          {Object.entries(answers).map(([id, value]) => (
            <AnswerLine key={id} label={id} value={answerToString(value)} />
          ))}
        </Card>
      )}
    </>
  );
}

function AnswerLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.answer}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText>{value || '—'}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexWrap: 'nowrap',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  content: {
    gap: Spacing.three,
    padding: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  recent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  answer: {
    gap: 2,
  },
});
