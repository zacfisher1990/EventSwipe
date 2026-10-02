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
