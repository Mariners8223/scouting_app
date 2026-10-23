import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { AppButton, Card, LabeledInput, SwitchRow } from '@/components/ui/controls';
import type { ColumnLayout } from '@/form/types';

type Props = {
  layout: ColumnLayout | undefined;
  onChange: (layout: ColumnLayout | undefined) => void;
  /** The tab's header row, once loaded. */
  headers: string[] | undefined;
  onLoadHeaders: () => void;
};

const letters = (text: string) => text.toUpperCase().replace(/[^A-Z]/g, '');

const constantsText = (constants: Record<string, string> | undefined) =>
  Object.entries(constants ?? {})
    .map(([column, value]) => `${column}=${value}`)
    .join('\n');

/** "C=Mariners" lines -> { C: 'Mariners' }. */
function parseConstants(text: string) {
  const constants: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const at = line.indexOf('=');
    if (at > 0) constants[letters(line.slice(0, at))] = line.slice(at + 1).trim();
  }
  return Object.keys(constants).length ? constants : undefined;
}

/** Fixed spreadsheet columns, for a sheet whose layout other formulas already depend on. */
export function ColumnLayoutEditor({ layout, onChange, headers, onLoadHeaders }: Props) {
  // Raw text so typing "C=" isn't undone while editing.
  const [text, setText] = useState(constantsText(layout?.constants));

  return (
    <Card title="Spreadsheet columns">
      <ThemedText type="small" themeColor="textSecondary">
        Off: every question gets its own column, named by its id. On: each question goes to the column letter set
        in the question, like the AppSheet table the dashboards read. Questions without a letter still get their own
        column after the fixed ones.
      </ThemedText>
      <SwitchRow
        label="Fixed column layout"
        value={!!layout}
        onChange={(on) => onChange(on ? { key: 'A', constants: parseConstants(text) } : undefined)}
      />
      {layout ? (
        <>
          <LabeledInput
            label="Column for the form id (used to skip forms sent twice)"
            value={layout.key}
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={(key) => onChange({ ...layout, key: letters(key) })}
          />
          <LabeledInput
            label="Same value in every row, one per line (e.g. C=Mariners)"
            value={text}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(next) => {
              setText(next);
              onChange({ ...layout, constants: parseConstants(next) });
            }}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {headers
              ? `${headers.length} columns loaded. Open a question to pick its column by name.`
              : 'Load the header row to pick each question’s column by name instead of typing letters.'}
          </ThemedText>
          <AppButton title={headers ? 'Reload columns from sheet' : 'Load columns from sheet'} onPress={onLoadHeaders} />
        </>
      ) : null}
    </Card>
  );
}
