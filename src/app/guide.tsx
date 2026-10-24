import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Markdown } from '@/components/markdown';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { TEMPLATE_GUIDE } from '@/content/template-guide';

/** How to build a template and connect it to a sheet (docs/template-guide.md), readable on every phone without the code. */
export default function GuideScreen() {
  const safeArea = useSafeAreaInsets();
  return (
    <ThemedView style={[styles.container, { paddingTop: safeArea.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: safeArea.bottom + BottomTabInset + Spacing.six }]}>
        <Markdown markdown={TEMPLATE_GUIDE} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
