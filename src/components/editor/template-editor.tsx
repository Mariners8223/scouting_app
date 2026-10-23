import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CodePrompt } from '@/components/editor/code-prompt';
import { ColumnLayoutEditor } from '@/components/editor/column-layout-editor';
import { OrderRuleEditor } from '@/components/editor/order-rule-editor';
import { SectionEditor } from '@/components/editor/section-editor';
import { SheetHeadersContext } from '@/components/editor/sheet-headers';
import { ThemedText } from '@/components/themed-text';
import { AppButton, Card, LabeledInput, Row } from '@/components/ui/controls';
import { Spacing } from '@/constants/theme';
import { duplicateSection, moveItem } from '@/form/edit';
import { newId, schemaProblems } from '@/form/logic';
import { sheetNameOf } from '@/form/sheet-row';
import type { FormSchema, Section } from '@/form/types';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/services/dialogs';
import { spreadsheetIdFrom } from '@/services/editor-code';
import { fetchHeaders } from '@/services/sheets-api';

type Props = {
  draft: FormSchema;
  onChange: (draft: FormSchema) => void;
};

/** Edits a copy of a template; the screen above decides when to save it. */
export function TemplateEditor({ draft, onChange }: Props) {
  const theme = useTheme();
  const [sectionId, setSectionId] = useState<string>();
  const [headers, setHeaders] = useState<string[]>();
  const [askingCode, setAskingCode] = useState(false);
  const sections = draft.sections;
  const setSections = (next: Section[]) => onChange({ ...draft, sections: next });
  const openSection = sections.find((s) => s.id === sectionId);

  const loadHeaders = async (code: string) => {
    setHeaders(await fetchHeaders(draft.spreadsheetId ?? '', sheetNameOf(draft), code));
    setAskingCode(false);
  };

  if (openSection) {
    return (
      <SheetHeadersContext.Provider value={headers}>
        <View style={styles.container}>
          <AppButton title="‹ All tabs" variant="ghost" small onPress={() => setSectionId(undefined)} style={styles.back} />
          <SectionEditor
            schema={draft}
            section={openSection}
            onChange={(section) => setSections(sections.map((s) => (s.id === section.id ? section : s)))}
          />
        </View>
      </SheetHeadersContext.Provider>
    );
  }

  const addSection = () => {
    const section: Section = { id: newId('tab'), title: 'New tab', questions: [] };
    setSections([...sections, section]);
    setSectionId(section.id);
  };

  const removeSection = (section: Section) =>
    confirmAction(
      'Delete tab?',
      `“${section.title}” and its ${section.questions.length} questions will be deleted.`,
      'Delete',
      () => setSections(sections.filter((s) => s.id !== section.id)),
    );

  const problems = schemaProblems(draft);

  return (
    <View style={styles.container}>
      <Card title="Template">
        <LabeledInput label="Name" value={draft.name} onChangeText={(name) => onChange({ ...draft, name })} />
        <LabeledInput
          label="Season (year)"
          value={String(draft.year || '')}
          keyboardType="number-pad"
          onChangeText={(text) => onChange({ ...draft, year: Number(text.replace(/\D/g, '')) || 0 })}
        />
        <LabeledInput
          label="Spreadsheet link (where the answers go; empty = the app's main spreadsheet)"
          value={draft.spreadsheetId ?? ''}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(text) => {
            setHeaders(undefined);
            onChange({ ...draft, spreadsheetId: spreadsheetIdFrom(text) || undefined });
          }}
        />
        <LabeledInput
          label="Spreadsheet tab (where the answers go)"
          value={draft.sheetName ?? ''}
          placeholder={draft.name}
          onChangeText={(sheetName) => {
            setHeaders(undefined);
            onChange({ ...draft, sheetName: sheetName || undefined });
          }}
        />
        <ThemedText type="small" themeColor="textSecondary">
          The Apps Script account needs edit access to the spreadsheet. Forms only go there after the template is
          published.
        </ThemedText>
      </Card>

      {problems.length ? (
        <Card title="Needs fixing before saving" style={{ borderColor: theme.danger }}>
          {problems.map((p) => (
            <ThemedText key={p} type="small" style={{ color: theme.danger }}>
              • {p}
            </ThemedText>
          ))}
        </Card>
      ) : null}

      <ThemedText type="smallBold" themeColor="textSecondary">
        TABS ({sections.length})
      </ThemedText>
      {sections.map((section, index) => (
        <Card key={section.id}>
          <Row style={{ flexWrap: 'nowrap' }}>
            <View style={{ flex: 1 }}>
              <ThemedText>{section.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {section.questions.length} questions{section.showIf ? ' · conditional' : ''}
              </ThemedText>
            </View>
            <AppButton title="Open" small variant="primary" onPress={() => setSectionId(section.id)} />
          </Row>
          <Row>
            <AppButton title="↑" small disabled={index === 0} onPress={() => setSections(moveItem(sections, index, -1))} />
            <AppButton
              title="↓"
              small
              disabled={index === sections.length - 1}
              onPress={() => setSections(moveItem(sections, index, 1))}
            />
            <AppButton
              title="Copy"
              small
              onPress={() => setSections([...sections, duplicateSection(draft, section)])}
            />
            <AppButton title="Delete" small variant="danger" onPress={() => removeSection(section)} />
          </Row>
        </Card>
      ))}
      <AppButton title="+ Add tab" variant="primary" onPress={addSection} />

      <OrderRuleEditor schema={draft} onChange={(orderRule) => onChange({ ...draft, orderRule })} />

      <ColumnLayoutEditor
        layout={draft.columnLayout}
        onChange={(columnLayout) => onChange({ ...draft, columnLayout })}
        headers={headers}
        onLoadHeaders={() => setAskingCode(true)}
      />

      {askingCode ? (
        <CodePrompt
          title="Load columns from the sheet"
          message={`Reads the header row of the “${sheetNameOf(draft)}” tab, so each question can pick its column by name.`}
          confirmText="Load"
          onConfirm={loadHeaders}
          onCancel={() => setAskingCode(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  back: {
    alignSelf: 'flex-start',
  },
});
