export function hasFixedCalendarDate(entry) {
  return Boolean(entry?.dueDate);
}

export function matchesRecentFilter(entry, activeFilter) {
  if (entry?.category === 'axiom') return false;

  if (activeFilter === 'calendar') {
    return hasFixedCalendarDate(entry);
  }

  if (activeFilter === 'work') {
    return entry?.category === 'work' && !hasFixedCalendarDate(entry);
  }

  return entry?.category !== 'work' && !hasFixedCalendarDate(entry);
}
