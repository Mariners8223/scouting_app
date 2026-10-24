import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CodePrompt } from '@/components/editor/code-prompt';
import { ThemedText } from '@/components/themed-text';
import { AppButton, Card, LabeledInput } from '@/components/ui/controls';
import { Spacing } from '@/constants/theme';
import { answerQuestions } from '@/form/logic';
import { columnIndex, columnLetter, KEY_NAME, sheetNameOf } from '@/form/sheet-row';
import type { FormSchema } from '@/form/types';
import { useTheme } from '@/hooks/use-theme';
import { showMessage } from '@/services/dialogs';
import { fetchSheetInfo, nameColumns, type SheetInfo } from '@/services/sheets-api';

type Props = {
  draft: FormSchema;
  onChange: (draft: FormSchema) => void;
};

const constantsText = (constants: Record<string, string> | undefined) =>
  Object.entries(constants ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');

/** "from=Mariners" lines -> { from: 'Mariners' }. */
function parseConstants(text: string) {
  const constants: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const at = line.indexOf('=');
    const name = line.slice(0, at).trim().replace(/\W/g, '');
    if (at > 0 && name) constants[name] = line.slice(at + 1).trim();
  }
  return Object.keys(constants).length ? constants : undefined;
}

/** A header turned into a usable range name: "From" -> "From", "Game Number" -> "Game_Number". */
const nameFromHeader = (header: string, fallback: string) => {
  const name = header.trim().replace(/\W+/g, '_').replace(/^_+|_+$/g, '');
  return /^[A-Za-z]\w*$/.test(name) ? name : fallback;
};

/**
 * Where each answer lands in the sheet. Nothing is set per question: every answer is sent with its id,
 * and the sheet puts it in the column with that named range or header (or a new column).
 */
export function SheetConnection({ draft, onChange }: Props) {
  const theme = useTheme();
  const [text, setText] = useState(constantsText(draft.constants));
  const [info, setInfo] = useState<SheetInfo>();
  const [asking, setAsking] = useState<'check' | 'convert'>();
  const tab = sheetNameOf(draft);

  const check = async (code: string) => {
    setInfo(await fetchSheetInfo(undefined, tab, code));
    setAsking(undefined);
  };

  /** Older template with column letters: name those columns in the sheet, then drop the letters. */
  const convert = async (code: string) => {
    const layout = draft.columnLayout!;
    const sheet = await fetchSheetInfo(undefined, tab, code);
    const columns: Record<string, string> = { [KEY_NAME]: layout.key };
    const constants: Record<string, string> = {};
    for (const [letter, value] of Object.entries(layout.constants ?? {})) {
      const name = nameFromHeader(sheet.headers[columnIndex(letter)] ?? '', `col${letter}`);
      columns[name] = letter;
      constants[name] = value;
    }
    for (const q of answerQuestions(draft)) if (q.column) columns[q.id] = q.column;
    const result = await nameColumns(undefined, tab, columns, code);
    onChange({
      ...draft,
      columnLayout: undefined,
      constants: Object.keys(constants).length ? constants : draft.constants,
      sections: draft.sections.map((s) => ({ ...s, questions: s.questions.map(({ column: _, ...q }) => q) })),
    });
    setText(constantsText(Object.keys(constants).length ? constants : draft.constants));
    setInfo(await fetchSheetInfo(undefined, tab, code));
    setAsking(undefined);
    showMessage(
      'Switched to named ranges',
      `${result.named.length} columns named.` +
        (result.skipped.length ? `\nSkipped: ${result.skipped.join(', ')}` : '') +
        '\nSave and publish the template to use it on all phones.',
    );
  };

  // Every name this template sends, in the order new columns would be added.
  const names = [KEY_NAME, ...Object.keys(draft.constants ?? {}), ...answerQuestions(draft).map((q) => q.id)];
  const placeOf = (name: string) => {
    if (!info) return '';
    const lower = name.toLowerCase();
    if (info.named[lower]) return `column ${info.named[lower]} (named range)`;
    const header = info.headers.indexOf(name);
    if (header >= 0) return `column ${columnLetter(header)} (header)`;
    if (info.elsewhere.includes(lower)) return 'new column (the name is used on another tab, so no named range)';
    return 'new column + named range';
  };

  return (
    <Card title="Sheet connection">
      <ThemedText type="small" themeColor="textSecondary">
        Every answer is sent with its question’s id. In the tab “{tab}”, it goes to the column that has a named range
        with that id (Data → Named ranges), else the column whose header is the id, else a new column at the end. New
        columns also get a named range, so dashboard tabs can use them in formulas, e.g. =COUNTIF(team, B1).
      </ThemedText>

      {draft.columnLayout ? (
        <View style={[styles.legacy, { borderColor: theme.danger }]}>
          <ThemedText type="small">
            This template still uses fixed column letters. Switching names those columns in the sheet (same places, so
            dashboards keep working) and removes the letters from the template.
          </ThemedText>
          <AppButton title="Switch to named ranges" onPress={() => setAsking('convert')} />
        </View>
      ) : (
        <LabeledInput
          label="Same value in every row, one per line (name=value, e.g. from=Mariners)"
          value={text}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(next) => {
            setText(next);
            onChange({ ...draft, constants: parseConstants(next) });
          }}
        />
      )}

      <AppButton title={info ? 'Check the sheet again' : 'Check the sheet'} onPress={() => setAsking('check')} />
      {info ? (
        info.exists ? (
          <View style={styles.list}>
            {names.map((name) => (
              <ThemedText key={name} type="small">
                <ThemedText type="smallBold">{name}</ThemedText> → {placeOf(name)}
              </ThemedText>
            ))}
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            The tab “{tab}” doesn’t exist yet. The first form creates it, with one column (and named range) per
            question.
          </ThemedText>
        )
      ) : null}

      {asking ? (
        <CodePrompt
          title={asking === 'check' ? 'Check the sheet' : 'Switch to named ranges'}
          message={
            asking === 'check'
              ? `Reads the headers and named ranges of the “${tab}” tab, and shows where each answer will go.`
              : `Names the columns this template uses in the “${tab}” tab after their question ids.`
          }
          confirmText={asking === 'check' ? 'Check' : 'Switch'}
          onConfirm={asking === 'check' ? check : convert}
          onCancel={() => setAsking(undefined)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  legacy: {
    gap: Spacing.two,
    padding: Spacing.two,
    borderWidth: 1,
    borderRadius: 10,
  },
  list: {
    gap: 2,
  },
});
