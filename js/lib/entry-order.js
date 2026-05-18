export const SORT_ORDER_STEP = 1000;

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function hasSortOrder(entry) {
  return Number.isFinite(entry?.sortOrder);
}

export function compareEntries(a, b) {
  const aDone = a?.done === true;
  const bDone = b?.done === true;

  if (aDone !== bDone) {
    return aDone ? 1 : -1;
  }

  const aHasSortOrder = hasSortOrder(a);
  const bHasSortOrder = hasSortOrder(b);

  if (aHasSortOrder && bHasSortOrder && a.sortOrder !== b.sortOrder) {
    return b.sortOrder - a.sortOrder;
  }

  if (aHasSortOrder !== bHasSortOrder) {
    return aHasSortOrder ? -1 : 1;
  }

  const timeDiff = toMillis(b?.createdAt) - toMillis(a?.createdAt);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

export function sortEntries(entries) {
  return [...entries].sort(compareEntries);
}

export function assignSequentialSortOrders(entries) {
  const orderedEntries = [...entries];
  let nextSortOrder = orderedEntries.length * SORT_ORDER_STEP;

  return orderedEntries.map((entry) => {
    const normalizedEntry = {
      ...entry,
      sortOrder: nextSortOrder
    };

    nextSortOrder -= SORT_ORDER_STEP;
    return normalizedEntry;
  });
}
