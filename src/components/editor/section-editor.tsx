import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConditionEditor } from '@/components/editor/condition-editor';
import { QuestionEditor } from '@/components/editor/question-editor';
import { ThemedText } from '@/components/themed-text';
import { AppButton, Card, LabeledInput, Row } from '@/components/ui/controls';
import { Spacing } from '@/constants/theme';
import { allQuestionIds, moveItem, uniqueId } from '@/form/edit';
import { QUESTION_TYPES, type FormSchema, type Question, type Section } from '@/form/types';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/services/dialogs';

type Props = {
  schema: FormSchema;
  section: Section;
  onChange: (section: Section) => void;
};

type Editing = { question: Question; index: number; isNew: boolean };

export function SectionEditor({ schema, section, onChange }: Props) {
  const theme = useTheme();
  const [editing, setEditing] = useState<Editing>();
  const questions = section.questions;
  const setQuestions = (next: Question[]) => onChange({ ...section, questions: next });

  const addQuestion = () =>
    setEditing({
      question: { id: '', type: 'enum', label: '', required: true },
      index: questions.length,
      isNew: true,
    });

  const duplicate = (q: Question, index: number) => {
    const copy = { ...q, id: uniqueId(q.id, allQuestionIds(schema)) };
    setQuestions([...questions.slice(0, index + 1), copy, ...questions.slice(index + 1)]);
  };

  const remove = (q: Question, index: number) =>
    confirmAction('Delete question?', q.label, 'Delete', () => setQuestions(questions.filter((_, i) => i !== index)));

  const saveEditing = (question: Question) => {
    if (!editing) return;
    setQuestions(
      editing.isNew
        ? [...questions.slice(0, editing.index), question, ...questions.slice(editing.index)]
        : questions.map((q, i) => (i === editing.index ? question : q)),
    );
    setEditing(undefined);
  };

  return (
    <View style={styles.container}>
      <Card title="Tab">
        <LabeledInput label="Title" value={section.title} onChangeText={(title) => onChange({ ...section, title })} />
        <ConditionEditor
          schema={schema}
          condition={section.showIf}
          label="Show this tab only if…"
          onChange={(showIf) => onChange({ ...section, showIf })}
        />
      </Card>

      <ThemedText type="smallBold" themeColor="textSecondary">
        QUESTIONS ({questions.length})
      </ThemedText>

      {questions.map((q, index) => (
        <Card key={`${q.id}-${index}`} style={styles.question}>
          <Row style={{ flexWrap: 'nowrap' }}>
            <View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small">{QUESTION_TYPES.find((t) => t.type === q.type)?.label.split(' (')[0]}</ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }} numberOfLines={1}>
              {q.type === 'header' ? '' : q.id}
              {q.required ? ' · required' : ''}
              {q.showIf ? ' · conditional' : ''}
            </ThemedText>
          </Row>
          <ThemedText type={q.type === 'header' ? 'smallBold' : 'default'}>{q.label || '(no text)'}</ThemedText>
          {q.options?.length ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {q.options.join(' · ')}
            </ThemedText>
          ) : null}
          <Row>
            <AppButton title="Edit" small variant="primary" onPress={() => setEditing({ question: q, index, isNew: false })} />
            <AppButton title="↑" small disabled={index === 0} onPress={() => setQuestions(moveItem(questions, index, -1))} />
            <AppButton
              title="↓"
              small
              disabled={index === questions.length - 1}
              onPress={() => setQuestions(moveItem(questions, index, 1))}
            />
            <AppButton title="Copy" small onPress={() => duplicate(q, index)} />
            <AppButton title="Delete" small variant="danger" onPress={() => remove(q, index)} />
          </Row>
        </Card>
      ))}

      <AppButton title="+ Add question" variant="primary" onPress={addQuestion} />

      {editing ? (
        <QuestionEditor
          schema={schema}
          question={editing.question}
          isNew={editing.isNew}
          onSave={saveEditing}
          onCancel={() => setEditing(undefined)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  question: {
    gap: Spacing.one + Spacing.half,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 6,
  },
});
