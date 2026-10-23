import { Alert } from 'react-native';

/** Native dialogs. The web version (dialogs.web.ts) uses the browser's, since Alert does nothing on web. */

export function showMessage(title: string, message?: string) {
  Alert.alert(title, message);
}

export function confirmAction(title: string, message: string, confirmText: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmText, style: 'destructive', onPress: onConfirm },
  ]);
}
