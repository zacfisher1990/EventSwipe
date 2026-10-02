// Browser-only setup, imported once from index.js.

import { Alert } from 'react-native';

// ---- Layout: a phone-width column, centred on wide screens ----
export const APP_MAX_WIDTH = 480;

const style = document.createElement('style');
style.textContent = `
  html, body { background: #e9eef0; }
  #root { max-width: ${APP_MAX_WIDTH}px; margin: 0 auto; background: #fff; box-shadow: 0 0 24px rgba(0, 0, 0, 0.08); }
  /* React Native's Modal is fixed to the window: keep it inside the column.
     Matched by its place in the page (body > portal > wrapper > wrapper >
     sheet) as well as by role, because the role is only set once the open
     animation has finished. */
  div[role="dialog"][aria-modal="true"],
  body > div:not(#root) > div > div > div { max-width: ${APP_MAX_WIDTH}px; margin: 0 auto; }
`;
document.head.appendChild(style);

// ---- Alert.alert does nothing on web: map it onto browser dialogs ----
// One button -> alert(). A cancel plus one action -> confirm(). More actions
// (e.g. the comment menu) -> one confirm per action until one is accepted.
Alert.alert = (title, message, buttons) => {
  const text = [title, message].filter(Boolean).join('\n\n');
  const actions = (buttons || []).filter((b) => b.style !== 'cancel');
  const cancel = (buttons || []).find((b) => b.style === 'cancel');

  if (!buttons || buttons.length === 0 || (actions.length <= 1 && !cancel)) {
    window.alert(text);
    actions[0]?.onPress?.();
    return;
  }
  if (actions.length === 1) {
    (window.confirm(text) ? actions[0] : cancel)?.onPress?.();
    return;
  }
  for (const action of actions) {
    if (window.confirm(`${text}\n\n${action.text}?`)) {
      action.onPress?.();
      return;
    }
  }
  cancel?.onPress?.();
};
