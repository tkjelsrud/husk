export function hasFixedCalendarDate(entry) {
  return Boolean(entry?.dueDate);
}

export function matchesRecentFilter(entry, activeFilter) {
  if (entry?.category === 'axiom') return false;

  if (activeFilter === 'later') {
    return entry?.later === true;
  }

  if (entry?.later === true) return false;

  if (activeFilter === 'calendar') {
    return hasFixedCalendarDate(entry);
  }

  if (activeFilter === 'work') {
    return entry?.category === 'work' && !hasFixedCalendarDate(entry);
  }

  if (activeFilter === 'houseproj') {
    return entry?.category === 'houseproj' && !hasFixedCalendarDate(entry);
  }

  return entry?.category !== 'work' && entry?.category !== 'houseproj' && !hasFixedCalendarDate(entry);
}
