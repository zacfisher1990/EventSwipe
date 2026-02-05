import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import en from './locales/en';
import es from './locales/es';
import pt from './locales/pt';
import tr from './locales/tr';
import id from './locales/id';
import de from './locales/de';
import fr from './locales/fr';
import ru from './locales/ru';
import uk from './locales/uk';
import it from './locales/it';
import pl from './locales/pl';
import ja from './locales/ja';
import ko from './locales/ko';
import th from './locales/th';
import zhHant from './locales/zh-Hant';
import zhHans from './locales/zh-Hans';

const i18n = new I18n({
  en,
  es,
  pt,
  tr,
  id,
  de,
  fr,
  ru,
  uk,
  it,
  pl,
  ja,
  ko,
  th,
  'zh-Hant': zhHant,
  'zh-Hans': zhHans,
  'zh-TW': zhHant,
  'zh-HK': zhHant,
  'zh-MO': zhHant,
  'zh-CN': zhHans,
  'zh-SG': zhHans,
  zh: zhHans,
});

// Set the locale based on device settings
// Falls back to 'en' if locale is undefined or not supported
const deviceLocale = Localization.locale || Localization.getLocales?.()?.[0]?.languageCode || 'en';
i18n.locale = deviceLocale; // Use device locale (change to 'es' or 'pt' for testing)
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export default i18n;