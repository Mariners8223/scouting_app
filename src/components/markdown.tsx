import { Fragment } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Shows the small part of Markdown the in-app guide uses: headings, paragraphs, lists, quotes,
 * tables, code blocks, rules, **bold**, `code` and [links](...) (shown as their text).
 * Hebrew text runs right to left; code stays left to right.
 */

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'item'; text: string; marker: string; depth: number }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'code'; text: string }
  | { kind: 'rule' };

function parse(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('```')) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i].replace(/^ {2}/, ''));
      blocks.push({ kind: 'code', text: code.join('\n') });
    } else if (/^#{1,3} /.test(trimmed)) {
      const level = trimmed.indexOf(' ');
      blocks.push({ kind: 'heading', level, text: trimmed.slice(level + 1) });
    } else if (trimmed === '---') {
      blocks.push({ kind: 'rule' });
    } else if (trimmed.startsWith('|')) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].trim().startsWith('|'); i++) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells); // skip the |---| row
      }
      i--;
      blocks.push({ kind: 'table', rows });
    } else if (trimmed.startsWith('> ')) {
      blocks.push({ kind: 'quote', text: trimmed.slice(2) });
    } else if (/^(- |\d+\. )/.test(trimmed)) {
      const marker = trimmed.startsWith('- ') ? '•' : trimmed.slice(0, trimmed.indexOf(' '));
      blocks.push({
        kind: 'item',
        marker,
        text: trimmed.slice(trimmed.indexOf(' ') + 1),
        depth: Math.floor((line.length - line.trimStart().length) / 2),
      });
    } else {
      // A paragraph runs until an empty line or another kind of block.
      const text = [trimmed];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|---|\||> |- |\d+\. |```)/.test(lines[i + 1].trim())) {
        text.push(lines[++i].trim());
      }
      blocks.push({ kind: 'paragraph', text: text.join(' ') });
    }
  }
  return blocks;
}

/** **bold**, `code` and [text](link) inside a line. */
function Inline({ text }: { text: string }) {
  const theme = useTheme();
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**')) {
          return (
            <ThemedText key={i} style={styles.bold}>
              {part.slice(2, -2)}
            </ThemedText>
          );
        }
        if (part.startsWith('`')) {
          return (
            <ThemedText key={i} style={[styles.inlineCode, { backgroundColor: theme.backgroundElement }]}>
              {/* Keeps ids like `team` readable inside Hebrew sentences. */}
              {'⁦' + part.slice(1, -1) + '⁩'}
            </ThemedText>
          );
        }
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        return <Fragment key={i}>{link ? link[1] : part}</Fragment>;
      })}
    </>
  );
}

function Line({ text, style }: { text: string; style?: object }) {
  return (
    <ThemedText style={[styles.rtl, style]}>
      <Inline text={text} />
    </ThemedText>
  );
}

export function Markdown({ markdown }: { markdown: string }) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      {parse(markdown).map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return <Line key={i} text={block.text} style={block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3} />;
          case 'paragraph':
            return <Line key={i} text={block.text} />;
          case 'quote':
            return (
              <View key={i} style={[styles.quote, { borderColor: theme.accent, backgroundColor: theme.backgroundElement }]}>
                <Line text={block.text} />
              </View>
            );
          case 'item':
            return (
              <View key={i} style={[styles.item, { marginRight: block.depth * Spacing.three }]}>
                <ThemedText style={styles.marker}>{block.marker}</ThemedText>
                <Line text={block.text} style={{ flex: 1 }} />
              </View>
            );
          case 'rule':
            return <View key={i} style={[styles.rule, { backgroundColor: theme.border }]} />;
          case 'code':
            return (
              <ScrollView
                key={i}
                horizontal
                style={[styles.code, { backgroundColor: theme.backgroundElement }]}
                contentContainerStyle={styles.codeContent}>
                <ThemedText style={styles.codeText}>{block.text}</ThemedText>
              </ScrollView>
            );
          case 'table':
            return (
              <View key={i} style={[styles.table, { borderColor: theme.border }]}>
                {block.rows.map((row, r) => (
                  <View
                    key={r}
                    style={[
                      styles.tableRow,
                      { borderColor: theme.border },
                      r === 0 && { backgroundColor: theme.backgroundElement },
                    ]}>
                    {row.map((cell, c) => (
                      <View key={c} style={styles.cell}>
                        <Line text={cell} style={[styles.cellText, r === 0 && styles.bold]} />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  rtl: {
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  h1: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: 700,
  },
  h2: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: 700,
    marginTop: Spacing.three,
  },
  h3: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: 700,
    marginTop: Spacing.two,
  },
  bold: {
    fontWeight: 700,
  },
  inlineCode: {
    fontFamily: Fonts?.mono,
    fontSize: 14,
  },
  quote: {
    borderRightWidth: 3,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 6,
  },
  item: {
    flexDirection: 'row-reverse',
    gap: Spacing.two,
  },
  marker: {
    minWidth: 18,
    textAlign: 'right',
  },
  rule: {
    height: 1,
    marginVertical: Spacing.two,
  },
  code: {
    borderRadius: 8,
  },
  codeContent: {
    padding: Spacing.three,
  },
  codeText: {
    fontFamily: Fonts?.mono,
    fontSize: 13,
    lineHeight: 20,
    writingDirection: 'ltr',
    textAlign: 'left',
  },
  table: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row-reverse',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    padding: Spacing.two,
  },
  cellText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
