import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Small building blocks shared by the Scout and Form Editor screens. Sized for gloves-on, in-the-stands use. */

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  small?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function AppButton({ title, onPress, variant = 'secondary', small, disabled, style }: ButtonProps) {
  const theme = useTheme();
  const background = {
    primary: theme.accent,
    secondary: theme.backgroundElement,
    danger: theme.backgroundElement,
    ghost: 'transparent',
  }[variant];
  const color = { primary: theme.onAccent, secondary: theme.text, danger: theme.danger, ghost: theme.accent }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: background, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}>
      <ThemedText type={small ? 'smallBold' : 'default'} style={{ color, textAlign: 'center' }}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

type ChoiceButtonsProps = {
  options: string[];
  selected: string[];
  onSelect: (option: string) => void;
  /** Stack options vertically, one per row. */
  vertical?: boolean;
};

export function ChoiceButtons({ options, selected, onSelect, vertical }: ChoiceButtonsProps) {
  const theme = useTheme();
  return (
    <View style={[styles.choices, vertical && styles.choicesVertical]}>
      {options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(option)}
            style={({ pressed }) => [
              styles.choice,
              {
                backgroundColor: isSelected ? theme.accent : theme.backgroundElement,
                borderColor: isSelected ? theme.accent : theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <ThemedText style={{ color: isSelected ? theme.onAccent : theme.text, textAlign: 'center' }}>
              {option}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LabeledInput({ label, style, ...props }: TextInputProps & { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      {label ? (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          props.multiline && styles.inputMultiline,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

export function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.switchRow}>
      <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.accent }} />
    </View>
  );
}

export function Card({ children, style, title }: { children: ReactNode; style?: ViewStyle; title?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }, style]}>
      {title ? (
        <ThemedText type="smallBold" themeColor="textSecondary">
          {title.toUpperCase()}
        </ThemedText>
      ) : null}
      {children}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: {
    minHeight: 36,
    paddingHorizontal: Spacing.two + Spacing.one,
    borderRadius: 10,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  choicesVertical: {
    flexDirection: 'column',
  },
  choice: {
    flexGrow: 1,
    minWidth: 56,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
  },
  inputMultiline: {
    minHeight: 96,
    paddingTop: Spacing.two + Spacing.one,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  card: {
    padding: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
