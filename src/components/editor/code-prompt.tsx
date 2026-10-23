import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppButton, LabeledInput, Row } from '@/components/ui/controls';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isEditorCode } from '@/services/editor-code';

type Props = {
  title: string;
  message: string;
  confirmText: string;
  /** Extra options shown above the code, e.g. a switch. */
  children?: ReactNode;
  /** Gets the checked code; may be async (the button shows a spinner text meanwhile). */
  onConfirm: (code: string) => Promise<void> | void;
  onCancel: () => void;
};

/** Asks for the editor code before an action that reaches all phones or the spreadsheet. */
export function CodePrompt({ title, message, confirmText, children, onConfirm, onCancel }: Props) {
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);

  const confirm = async () => {
    if (!code || working) return;
    setWorking(true);
    setError(undefined);
    try {
      if (!(await isEditorCode(code))) {
        setError('Wrong code');
        setCode('');
        return;
      }
      await onConfirm(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={[styles.dialog, { backgroundColor: theme.background }]}>
          <ThemedText type="smallBold">{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {message}
          </ThemedText>
          {children}
          <LabeledInput
            label="Editor code"
            value={code}
            onChangeText={(text) => {
              setCode(text);
              setError(undefined);
            }}
            onSubmitEditing={confirm}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
          />
          {error ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          ) : null}
          <Row style={{ flexWrap: 'nowrap' }}>
            <AppButton title="Cancel" onPress={onCancel} style={{ flex: 1 }} />
            <AppButton
              title={working ? 'Working…' : confirmText}
              variant="primary"
              disabled={!code || working}
              onPress={confirm}
              style={{ flex: 1 }}
            />
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dialog: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 16,
  },
});
