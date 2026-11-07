// Encart info fermé : préférence d'affichage locale, volontairement hors de State.
// Rien d'autre que cet encart n'en dépend.
const DISMISSED_KEY = "tipDismissed";

export async function tipDismissed(): Promise<boolean> {
  const stored = await chrome.storage.local.get({ [DISMISSED_KEY]: false });
  return stored[DISMISSED_KEY] === true;
}

export async function dismissTip(): Promise<void> {
  await chrome.storage.local.set({ [DISMISSED_KEY]: true });
}
