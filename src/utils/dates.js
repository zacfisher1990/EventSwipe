import * as Localization from 'expo-localization';

// Parse date string in multiple formats
export const parseEventDate = (dateString) => {
  if (!dateString) return null;
  
  if (dateString.includes('-') && dateString.indexOf('-') === 4) {
    const [year, month, day] = dateString.split('-').map(Number);
    if (year && month && day) {
      return new Date(year, month - 1, day);
    }
  }
  
  if (dateString.includes('/')) {
    const [month, day, year] = dateString.split('/').map(Number);
    if (month && day && year) {
      return new Date(year, month - 1, day);
    }
  }
  
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
};

/** A Date as a local YYYY-MM-DD string (the format event dates use). */
export const toLocalDateString = (date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/** "Oct 24" in the device's language. */
export const formatShortDate = (date) => {
  try {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return toLocalDateString(date);
  }
};

/** "Oct 24" or "Oct 24 – Oct 26" for a pair of YYYY-MM-DD strings. */
export const formatDateRange = (startString, endString) => {
  const start = parseEventDate(startString);
  if (!start) return '';
  const end = parseEventDate(endString);
  return end && end > start ? `${formatShortDate(start)} – ${formatShortDate(end)}` : formatShortDate(start);
};

// ---- Showing event dates and times ----
// Events store dates as YYYY-MM-DD and times as 24-hour HH:MM. They're shown
// in the convention of the phone's own region (e.g. "Sat, Oct 24" and
// "7:00 PM" in the US, "Sa., 24. Okt." and "19:00" in Germany), following the
// user's 12/24-hour clock setting.

const deviceLocale = () => {
  try {
    return Localization.getLocales()[0]?.languageTag || undefined;
  } catch {
    return undefined;
  }
};

// true / false from the device's clock setting, or undefined to let the region decide
const deviceUses24HourClock = () => {
  try {
    const setting = Localization.getCalendars()[0]?.uses24hourClock;
    return typeof setting === 'boolean' ? setting : undefined;
  } catch {
    return undefined;
  }
};

// Event dates are Gregorian wherever the event is, so regions whose phones
// default to another calendar (e.g. Saudi Arabia) still see the ticketed date.
const gregorian = (locale) => (locale && !locale.includes('-u-') ? `${locale}-u-ca-gregory` : locale);

// Runs each formatter in turn and returns the first usable result. Guards
// against a JavaScript engine that rejects a locale or option.
const firstWorking = (attempts, fallback) => {
  for (const attempt of attempts) {
    try {
      const text = attempt();
      if (text) return text;
    } catch {
      // try the next one
    }
  }
  return fallback;
};

/** "Sat, Oct 24" (adds the year when it isn't this year). Unparseable input is returned as-is. */
export const formatEventDate = (dateString) => {
  const date = parseEventDate(dateString);
  if (!date) return dateString || '';
  const options = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
  };
  const locale = deviceLocale();
  return firstWorking([
    () => date.toLocaleDateString(gregorian(locale), options),
    () => date.toLocaleDateString(locale, options),
    () => date.toLocaleDateString(undefined, options),
  ], dateString);
};

/** "7:00 PM" or "19:00" from a 24-hour "HH:MM" string. Unparseable input is returned as-is. */
export const formatEventTime = (timeString) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(timeString || '');
  if (!match) return timeString || '';
  const hours = Number(match[1]);
  const minutes = match[2];
  const locale = deviceLocale();
  const uses24Hour = deviceUses24HourClock();

  // 24-hour times are already in their final form; writing them directly also
  // avoids engines that render midnight as "24:00"
  if (uses24Hour === true) return `${String(hours).padStart(2, '0')}:${minutes}`;

  const time = new Date(2000, 0, 1, hours, Number(minutes));
  const base = { hour: 'numeric', minute: '2-digit' };
  const twelveHour = `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
  return firstWorking(
    uses24Hour === false
      ? [() => time.toLocaleTimeString(locale, { ...base, hour12: true })]
      : [() => time.toLocaleTimeString(locale, base)], // no setting known: the region decides
    uses24Hour === false ? twelveHour : timeString
  );
};

/** "Sat, Oct 24 • 7:00 PM", or just the date when there's no time. */
export const formatEventDateTime = (dateString, timeString) =>
  [formatEventDate(dateString), timeString ? formatEventTime(timeString) : '']
    .filter(Boolean)
    .join(' • ');
