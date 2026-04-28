export const HIDE_OLDER_THAN_DAYS = 14;

export function shouldHideEntry(entry, now = new Date()) {
  return entry?.done === true || isOlderThanThreshold(entry?.createdAt, now) || isPastDue(entry?.dueDate, now);
}

export function isOlderThanThreshold(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return false;

  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() - HIDE_OLDER_THAN_DAYS);
  return date < threshold;
}

export function isPastDue(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return false;
  return date < now;
}

export function toDate(value) {
  if (!value) return null;

  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}
