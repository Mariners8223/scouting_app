import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ChoiceButtons, LabeledInput } from '@/components/ui/controls';
import { Spacing } from '@/constants/theme';
import { interpolate } from '@/form/logic';
import type { AnswerValue, Answers, Question } from '@/form/types';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  question: Question;
  answers: Answers;
  onChange: (value: AnswerValue | undefined) => void;
  /** Highlights a required question the scouter skipped. */
  showMissing?: boolean;
};

/** Renders one question of any type. Adding a new question type means adding a case here. */
export function QuestionField({ question, answers, onChange, showMissing }: Props) {
  const theme = useTheme();
  const value = answers[question.id];
  const label = interpolate(question.label, answers);

  if (question.type === 'header') {
    return (
      <View style={styles.header}>
        <ThemedText type="smallBold" style={styles.headerText}>
          {label}
        </ThemedText>
        {question.description ? (
          <ThemedText type="small" themeColor="textSecondary">
            {interpolate(question.description, answers)}
          </ThemedText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.question}>
      <ThemedText style={showMissing ? { color: theme.danger } : undefined}>
        {label}
        {question.required ? <ThemedText style={{ color: theme.accent }}> *</ThemedText> : null}
      </ThemedText>
      {question.description ? (
        <ThemedText type="small" themeColor="textSecondary">
          {interpolate(question.description, answers)}
        </ThemedText>
      ) : null}
      <Input question={question} value={value} onChange={onChange} />
    </View>
  );
}

function Input({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | undefined) => void;
}) {
  switch (question.type) {
    case 'enum':
    case 'yesNo': {
      const options = question.type === 'yesNo' ? ['N', 'Y'] : (question.options ?? []);
      return (
        <ChoiceButtons
          options={options}
          selected={typeof value === 'string' ? [value] : []}
          // Tapping the selected option again clears it.
          onSelect={(option) => onChange(value === option ? undefined : option)}
        />
      );
    }
    case 'enumList': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <ChoiceButtons
          options={question.options ?? []}
          selected={selected}
          onSelect={(option) =>
            onChange(selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option])
          }
        />
      );
    }
    case 'number':
      return <Counter question={question} value={typeof value === 'number' ? value : undefined} onChange={onChange} />;
    case 'text':
    case 'longText':
      return (
        <LabeledInput
          value={typeof value === 'string' ? value : ''}
          onChangeText={(text) => onChange(text || undefined)}
          multiline={question.type === 'longText'}
        />
      );
    default:
      return null;
  }
}

function Counter({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  const step = question.step || 1;
  const clamp = (n: number) => Math.min(question.max ?? Infinity, Math.max(question.min ?? -Infinity, n));
  const current = value ?? question.min ?? 0;

  const button = (text: string, delta: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={delta > 0 ? 'Increase' : 'Decrease'}
      onPress={() => onChange(clamp(current + delta))}
      style={({ pressed }) => [
        styles.counterButton,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
      ]}>
      <ThemedText type="subtitle">{text}</ThemedText>
    </Pressable>
  );

  return (
    <View style={styles.counter}>
      {button('−', -step)}
      <ThemedText type="subtitle" style={[styles.counterValue, value === undefined && { color: theme.textSecondary }]}>
        {current}
      </ThemedText>
      {button('+', step)}
    </View>
  );
}

const styles = StyleSheet.create({
  question: {
    gap: Spacing.two,
  },
  header: {
    marginTop: Spacing.three,
    gap: Spacing.one,
  },
  headerText: {
    fontSize: 18,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  counterButton: {
    width: 72,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    minWidth: 64,
    textAlign: 'center',
  },
});
