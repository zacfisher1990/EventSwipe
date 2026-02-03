import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import en from './locales/en';
import es from './locales/es';
import pt from './locales/pt';
import tr from './locales/tr';
import id from './locales/id';
import de from './locales/de';
import fr from './locales/fr';

const i18n = new I18n({
  en,
  es,
  pt,
  tr,
  id,
  de,
  fr,
});

// Set the locale based on device settings
// Falls back to 'en' if locale is undefined or not supported
const deviceLocale = Localization.locale || Localization.getLocales?.()?.[0]?.languageCode || 'en';
i18n.locale = deviceLocale; // Use device locale (change to 'es' or 'pt' for testing)
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export default i18n;