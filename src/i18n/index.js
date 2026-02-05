import { I18nManager } from 'react-native';
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
import vi from './locales/vi';
import ar from './locales/ar';
import he from './locales/he';
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
  vi,
  ar,
  he,
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
i18n.locale = deviceLocale;
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

// RTL support for Arabic and Hebrew
const RTL_LANGUAGES = ['ar', 'he'];
const languageCode = deviceLocale.split('-')[0];
const isRTL = RTL_LANGUAGES.includes(languageCode);

if (I18nManager.isRTL !== isRTL) {
  I18nManager.allowRTL(isRTL);
  I18nManager.forceRTL(isRTL);
  // Note: RTL changes require an app restart to take effect.
  // On first launch with an RTL language, the app will need to restart once.
  // You can use expo-updates Updates.reloadAsync() to trigger this automatically.
}

export { isRTL };
export default i18n;