import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps, type TabListProps } from 'expo-router/ui';
import { Pressable, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/** Bottom tab bar for the web / PWA build, laid out like the native tabs so it never covers the screen. */
export default function AppTabs() {
  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <BottomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Scout</TabButton>
          </TabTrigger>
          <TabTrigger name="editor" href="/editor" asChild>
            <TabButton>Form Editor</TabButton>
          </TabTrigger>
          <TabTrigger name="guide" href="/guide" asChild>
            <TabButton>Guide</TabButton>
          </TabTrigger>
        </BottomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, onPress, onLongPress }: TabTriggerSlotProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
      <View style={[styles.indicator, { backgroundColor: isFocused ? theme.accent : 'transparent' }]} />
      <ThemedText type="smallBold" style={{ color: isFocused ? theme.accent : theme.textSecondary }}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

export function BottomTabList({ children }: TabListProps) {
  const theme = useTheme();
  const safeArea = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.tabList,
        { backgroundColor: theme.background, borderTopColor: theme.border, paddingBottom: safeArea.bottom },
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  slot: {
    flex: 1,
  },
  tabList: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  tabButton: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  indicator: {
    width: 32,
    height: 3,
    borderRadius: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
