import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppButton, Card, LabeledInput } from '@/components/ui/controls';
import { EDITOR_CODE_SHA256 } from '@/config';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

async function isEditorCode(code: string) {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, code);
  return hash === EDITOR_CODE_SHA256;
}

/** Asks for the editor code before templates can be changed, so scouters can't edit the form by accident. */
export function EditorLock({ onUnlock }: { onUnlock: () => void }) {
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    if (!code || checking) return;
    setChecking(true);
    const ok = await isEditorCode(code);
    setChecking(false);
    if (ok) {
      onUnlock();
    } else {
      setWrong(true);
      setCode('');
    }
  };

  return (
    <View style={styles.container}>
      <Card title="Locked">
        <ThemedText>Enter the editor code to change the form templates.</ThemedText>
        <LabeledInput
          label="Code"
          value={code}
          onChangeText={(text) => {
            setCode(text);
            setWrong(false);
          }}
          onSubmitEditing={submit}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
        {wrong ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            Wrong code
          </ThemedText>
        ) : null}
        <AppButton title={checking ? 'Checking…' : 'Unlock'} variant="primary" disabled={!code || checking} onPress={submit} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
});
