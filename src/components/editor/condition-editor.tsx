import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppButton, ChoiceButtons, SwitchRow } from '@/components/ui/controls';
import { Spacing } from '@/constants/theme';
import { choiceQuestions, choicesOf, findQuestion } from '@/form/edit';
import type { Condition, FormSchema } from '@/form/types';
import { useTheme } from '@/hooks/use-theme';

/** Lets the user pick one question that has a fixed list of answers. */
export function QuestionPicker({
  schema,
  value,
  onChange,
  excludeId,
}: {
  schema: FormSchema;
  value: string | undefined;
  onChange: (id: string) => void;
  excludeId?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(!value);
  const candidates = choiceQuestions(schema).filter(({ question }) => question.id !== excludeId);
  const current = candidates.find(({ question }) => question.id === value);

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[styles.picked, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText style={{ flex: 1 }}>
          {current ? `${current.section.title} › ${current.question.label}` : 'Pick a question'}
        </ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          Change
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <ScrollView
      nestedScrollEnabled
      style={[styles.list, { borderColor: theme.border }]}
      contentContainerStyle={styles.listContent}>
      {candidates.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Add an Enum or Yes/No question first.
        </ThemedText>
      ) : (
        candidates.map(({ section, question }) => {
          const selected = question.id === value;
          return (
            <Pressable
              key={question.id}
              accessibilityRole="button"
              onPress={() => {
                onChange(question.id);
                setOpen(false);
              }}
              style={[styles.listItem, selected && { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {section.title}
              </ThemedText>
              <ThemedText>{question.label}</ThemedText>
            </Pressable>
          );
        })
      )}
      {value ? <AppButton title="Cancel" small variant="ghost" onPress={() => setOpen(false)} /> : null}
    </ScrollView>
  );
}

export function ConditionEditor({
  schema,
  condition,
  onChange,
  excludeId,
  label = 'Show only if…',
}: {
  schema: FormSchema;
  condition: Condition | undefined;
  onChange: (condition: Condition | undefined) => void;
  excludeId?: string;
  label?: string;
}) {
  const question = findQuestion(schema, condition?.questionId);
  const values = choicesOf(question);

  return (
    <View style={styles.editor}>
      <SwitchRow
        label={label}
        value={!!condition}
        onChange={(on) => onChange(on ? { questionId: '', op: 'equals', value: '' } : undefined)}
      />
      {condition ? (
        <>
          <QuestionPicker
            schema={schema}
            value={condition.questionId || undefined}
            excludeId={excludeId}
            onChange={(questionId) => onChange({ ...condition, questionId, value: '' })}
          />
          {question ? (
            <>
              <ChoiceButtons
                options={['is', 'is not']}
                selected={[condition.op === 'equals' ? 'is' : 'is not']}
                onSelect={(op) => onChange({ ...condition, op: op === 'is' ? 'equals' : 'notEquals' })}
              />
              <ChoiceButtons
                options={values}
                selected={[condition.value]}
                onSelect={(value) => onChange({ ...condition, value })}
              />
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: {
    gap: Spacing.two,
  },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
  },
  list: {
    maxHeight: 320,
    borderWidth: 1,
    borderRadius: 12,
  },
  listContent: {
    padding: Spacing.two,
    gap: Spacing.one,
  },
  listItem: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: 8,
  },
});
