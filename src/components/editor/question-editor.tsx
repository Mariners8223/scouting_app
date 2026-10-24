import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConditionEditor } from '@/components/editor/condition-editor';
import { QuestionField } from '@/components/form/question-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton, Card, ChoiceButtons, LabeledInput, Row, SwitchRow } from '@/components/ui/controls';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { allQuestionIds, idFromLabel } from '@/form/edit';
import { QUESTION_TYPES, type Answers, type FormSchema, type Question, type QuestionType } from '@/form/types';
import { showMessage } from '@/services/dialogs';

type Props = {
  schema: FormSchema;
  question: Question;
  isNew: boolean;
  onSave: (question: Question) => void;
  onCancel: () => void;
};

const parseNumber = (text: string) => (text.trim() === '' || isNaN(Number(text)) ? undefined : Number(text));
const numberText = (n: number | undefined) => (n === undefined ? '' : String(n));

export function QuestionEditor({ schema, question, isNew, onSave, onCancel }: Props) {
  const safeArea = useSafeAreaInsets();
  const [q, setQ] = useState<Question>(question);
  // Raw text so typing a new line or a minus sign isn't undone while editing.
  const [optionsText, setOptionsText] = useState((question.options ?? []).join('\n'));
  const [minText, setMinText] = useState(numberText(question.min));
  const [maxText, setMaxText] = useState(numberText(question.max));
  const [stepText, setStepText] = useState(numberText(question.step));
  const [idTouched, setIdTouched] = useState(!isNew);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});

  const takenIds = allQuestionIds(schema);
  takenIds.delete(question.id);

  const hasOptions = q.type === 'enum' || q.type === 'enumList';
  const answers = q.type !== 'header';
  const options = optionsText
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean);

  const built: Question = {
    ...q,
    options: hasOptions ? [...new Set(options)] : undefined,
    min: q.type === 'number' ? parseNumber(minText) : undefined,
    max: q.type === 'number' ? parseNumber(maxText) : undefined,
    step: q.type === 'number' ? parseNumber(stepText) : undefined,
    required: answers ? q.required : undefined,
    keepAfterSubmit: answers ? q.keepAfterSubmit : undefined,
  };

  const save = () => {
    const problems: string[] = [];
    if (!built.label.trim()) problems.push('Write the question text.');
    if (!/^\w+$/.test(built.id)) problems.push('The id may only use English letters, numbers and _.');
    if (takenIds.has(built.id)) problems.push(`The id "${built.id}" is already used by another question.`);
    if (hasOptions && !built.options?.length) problems.push('Add at least one option.');
    if (built.showIf && (!built.showIf.questionId || !built.showIf.value)) {
      problems.push('Finish the "show only if" condition or turn it off.');
    }
    if (problems.length) {
      showMessage('Can’t save yet', problems.join('\n'));
      return;
    }
    onSave(built);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <ThemedView style={[styles.container, { paddingTop: safeArea.top || Spacing.three }]}>
        <Row style={styles.header}>
          <AppButton title="Cancel" variant="ghost" small onPress={onCancel} />
          <ThemedText type="smallBold" style={{ flex: 1, textAlign: 'center' }}>
            {isNew ? 'New question' : 'Edit question'}
          </ThemedText>
          <AppButton title="Done" variant="primary" small onPress={save} />
        </Row>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: safeArea.bottom + Spacing.six }]}>
          <Card title="Type">
            <ChoiceButtons
              options={QUESTION_TYPES.map((t) => t.label)}
              selected={[QUESTION_TYPES.find((t) => t.type === q.type)!.label]}
              onSelect={(label) =>
                setQ({ ...q, type: QUESTION_TYPES.find((t) => t.label === label)!.type as QuestionType })
              }
            />
          </Card>

          <Card title="Question">
            <LabeledInput
              label="Text shown to the scouter"
              value={q.label}
              onChangeText={(label) =>
                setQ({ ...q, label, id: idTouched ? q.id : idFromLabel(label, takenIds) })
              }
              placeholder="e.g. How many cycles"
            />
            <ThemedText type="small" themeColor="textSecondary">
              Tip: {'{team}'} inserts the answer of the question with id “team”.
            </ThemedText>
            <LabeledInput
              label="Description (optional)"
              value={q.description ?? ''}
              onChangeText={(description) => setQ({ ...q, description: description || undefined })}
              multiline
            />
            <LabeledInput
              label="Id (English, no spaces): the named range or column header this answer goes to in the sheet"
              value={q.id}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(id) => {
                setIdTouched(true);
                setQ({ ...q, id: id.replace(/\s/g, '') });
              }}
            />
          </Card>

          {hasOptions ? (
            <Card title="Options">
              <LabeledInput
                label="One option per line"
                value={optionsText}
                onChangeText={setOptionsText}
                multiline
                autoCapitalize="none"
                style={{ minHeight: 160 }}
              />
            </Card>
          ) : null}

          {q.type === 'number' ? (
            <Card title="Counter">
              <Row style={{ flexWrap: 'nowrap' }}>
                <NumberInput label="Min" value={minText} onChange={setMinText} placeholder="none" />
                <NumberInput label="Max" value={maxText} onChange={setMaxText} placeholder="none" />
                <NumberInput label="Step" value={stepText} onChange={setStepText} placeholder="1" />
              </Row>
            </Card>
          ) : null}

          {answers ? (
            <Card title="Rules">
              <SwitchRow label="Required" value={!!q.required} onChange={(required) => setQ({ ...q, required })} />
              <SwitchRow
                label={q.type === 'number' ? 'Keep for next match (+1 step)' : 'Keep for next match'}
                value={!!q.keepAfterSubmit}
                onChange={(keepAfterSubmit) => setQ({ ...q, keepAfterSubmit })}
              />
            </Card>
          ) : null}

          <Card title="Visibility">
            <ConditionEditor
              schema={schema}
              condition={q.showIf}
              excludeId={question.id}
              onChange={(showIf) => setQ({ ...q, showIf })}
            />
          </Card>

          <Card title="Preview">
            <QuestionField
              question={built}
              answers={previewAnswers}
              onChange={(value) => setPreviewAnswers({ ...previewAnswers, [built.id]: value })}
            />
          </Card>
        </ScrollView>
      </ThemedView>
    </Modal>
  );
}

function NumberInput(props: { label: string; value: string; onChange: (text: string) => void; placeholder: string }) {
  return (
    <View style={{ flex: 1 }}>
      <LabeledInput
        label={props.label}
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        keyboardType="numbers-and-punctuation"
      />
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
});
