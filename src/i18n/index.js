import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import en from './locales/en';
import es from './locales/es';

const i18n = new I18n({
  en,
  es,
});

// Set the locale based on device settings
// Falls back to 'en' if locale is undefined or not supported
const deviceLocale = Localization.locale || Localization.getLocales?.()?.[0]?.languageCode || 'en';
i18n.locale = 'es'; // Force Spanish for testing
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export default i18n;