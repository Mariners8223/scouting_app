import { StyleSheet, View } from 'react-native';

import { QuestionPicker } from '@/components/editor/condition-editor';
import { ThemedText } from '@/components/themed-text';
import { AppButton, Card, Row, SwitchRow } from '@/components/ui/controls';
import { Spacing } from '@/constants/theme';
import { choicesOf, findQuestion, moveItem } from '@/form/edit';
import type { FormSchema, SectionOrderRule } from '@/form/types';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  schema: FormSchema;
  onChange: (rule: SectionOrderRule | undefined) => void;
};

/** The tab order for one answer, with tabs the variant doesn't mention kept at the end. */
function fullOrder(schema: FormSchema, variant: string[] | undefined) {
  const ids = schema.sections.map((s) => s.id);
  const known = (variant ?? []).filter((id) => ids.includes(id));
  return [...known, ...ids.filter((id) => !known.includes(id))];
}

export function OrderRuleEditor({ schema, onChange }: Props) {
  const theme = useTheme();
  const rule = schema.orderRule;
  const question = findQuestion(schema, rule?.questionId);
  const titles = new Map(schema.sections.map((s) => [s.id, s.title]));

  return (
    <Card title="Tab order">
      <ThemedText type="small" themeColor="textSecondary">
        Change the order of the tabs by an answer, e.g. who won Auto decides whether Active or Inactive comes first.
      </ThemedText>
      <SwitchRow
        label="Order depends on an answer"
        value={!!rule}
        onChange={(on) => onChange(on ? { questionId: '', variants: {} } : undefined)}
      />
      {rule ? (
        <>
          <QuestionPicker
            schema={schema}
            value={rule.questionId || undefined}
            onChange={(questionId) => onChange({ questionId, variants: {} })}
          />
          {choicesOf(question).map((answer) => {
            const order = fullOrder(schema, rule.variants[answer]);
            const setOrder = (next: string[]) =>
              onChange({ ...rule, variants: { ...rule.variants, [answer]: next } });
            return (
              <View key={answer} style={[styles.variant, { borderColor: theme.border }]}>
                <ThemedText type="smallBold">When the answer is “{answer}”</ThemedText>
                {order.map((id, index) => (
                  <Row key={id} style={{ flexWrap: 'nowrap' }}>
                    <ThemedText style={{ flex: 1 }}>
                      {index + 1}. {titles.get(id)}
                    </ThemedText>
                    <AppButton title="↑" small disabled={index === 0} onPress={() => setOrder(moveItem(order, index, -1))} />
                    <AppButton
                      title="↓"
                      small
                      disabled={index === order.length - 1}
                      onPress={() => setOrder(moveItem(order, index, 1))}
                    />
                  </Row>
                ))}
              </View>
            );
          })}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  variant: {
    gap: Spacing.one,
    padding: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
  },
});
