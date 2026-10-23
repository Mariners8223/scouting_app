import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppButton, Card, ChoiceButtons, LabeledInput, Row } from '@/components/ui/controls';
import { Spacing } from '@/constants/theme';
import { useTemplates } from '@/context/templates-context';
import { answerQuestions } from '@/form/logic';
import type { FormSchema } from '@/form/types';
import { useTheme } from '@/hooks/use-theme';

const BLANK = 'Blank';

/** All saved templates, one or more per season. */
export function TemplatesList({ onEdit }: { onEdit: (id: string) => void }) {
  const theme = useTheme();
  const { templates, active, setActive, createTemplate, deleteTemplate } = useTemplates();
  const [creating, setCreating] = useState(false);
  const newest = templates[0];
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [copyFrom, setCopyFrom] = useState<string>();

  const label = (t: FormSchema) => `${t.year} · ${t.name}`;

  const startCreating = (source?: FormSchema) => {
    const nextYear = (source?.year ?? newest?.year ?? new Date().getFullYear()) + 1;
    setName(source ? source.name.replace(/\d{4}/, String(nextYear)) : `Match Scouting ${nextYear}`);
    setYear(String(nextYear));
    setCopyFrom(source?.id);
    setCreating(true);
  };

  const create = () => {
    const y = Number(year);
    if (!name.trim() || !y) {
      Alert.alert('Missing details', 'Write a name and a year.');
      return;
    }
    const id = createTemplate({ name: name.trim(), year: y, copyFromId: copyFrom });
    setCreating(false);
    onEdit(id);
  };

  const remove = (t: FormSchema) => {
    if (templates.length === 1) {
      Alert.alert('Can’t delete', 'You need at least one template.');
      return;
    }
    Alert.alert('Delete template?', `${label(t)} will be deleted from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTemplate(t.id) },
    ]);
  };

  return (
    <View style={styles.container}>
      {creating ? (
        <Card title="New template">
          <LabeledInput label="Name" value={name} onChangeText={setName} />
          <LabeledInput
            label="Season (year)"
            value={year}
            onChangeText={(t) => setYear(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
          />
          <ThemedText type="small" themeColor="textSecondary">
            Start from
          </ThemedText>
          <ChoiceButtons
            vertical
            options={[BLANK, ...templates.map(label)]}
            selected={[copyFrom ? label(templates.find((t) => t.id === copyFrom)!) : BLANK]}
            onSelect={(option) => setCopyFrom(templates.find((t) => label(t) === option)?.id)}
          />
          <Row style={{ flexWrap: 'nowrap' }}>
            <AppButton title="Cancel" onPress={() => setCreating(false)} style={{ flex: 1 }} />
            <AppButton title="Create" variant="primary" onPress={create} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : (
        <AppButton title="+ New template" variant="primary" onPress={() => startCreating()} />
      )}

      {templates.map((t) => {
        const isActive = t.id === active?.id;
        return (
          <Card key={t.id} style={isActive ? { borderColor: theme.accent, borderWidth: 2 } : undefined}>
            <Row style={{ flexWrap: 'nowrap' }}>
              <ThemedText type="subtitle" style={{ fontSize: 24, lineHeight: 30 }}>
                {t.year}
              </ThemedText>
              <View style={{ flex: 1 }}>
                <ThemedText>{t.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t.sections.length} tabs · {answerQuestions(t).length} questions · v{t.version}
                </ThemedText>
              </View>
              {isActive ? (
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  IN USE
                </ThemedText>
              ) : null}
            </Row>
            <Row>
              <AppButton title="Edit" small variant="primary" onPress={() => onEdit(t.id)} />
              {!isActive ? <AppButton title="Use for scouting" small onPress={() => setActive(t.id)} /> : null}
              <AppButton title="Copy to new year" small onPress={() => startCreating(t)} />
              <AppButton title="Delete" small variant="danger" onPress={() => remove(t)} />
            </Row>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
});
