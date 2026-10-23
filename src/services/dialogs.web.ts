/** Browser dialogs for the web / PWA build; react-native-web's Alert does nothing. */

export function showMessage(title: string, message?: string) {
  window.alert(message ? `${title}\n\n${message}` : title);
}

export function confirmAction(title: string, message: string, _confirmText: string, onConfirm: () => void) {
  if (window.confirm(`${title}\n\n${message}`)) onConfirm();
}
