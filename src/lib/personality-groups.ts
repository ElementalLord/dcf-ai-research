/** Category membership as returned by a `personality_categories(is_primary,categories(name))` select. */
export type CategoryMembership = { is_primary?: boolean | null; categories: { name: string } | Array<{ name: string }> | null };

/** The name of a person's primary research category, or their first one. */
export function primaryCategoryName(memberships: CategoryMembership[] | null | undefined): string | null {
  const list = memberships || [];
  const chosen = list.find((membership) => membership.is_primary) || list[0];
  const category = Array.isArray(chosen?.categories) ? chosen.categories[0] : chosen?.categories;
  return category?.name || null;
}

/** People grouped by category for a picker: groups in name order, uncategorized people last. */
export function groupByCategory<T extends { category?: string | null }>(people: T[], fallback = "Other"): Array<{ label: string; people: T[] }> {
  const groups = new Map<string, T[]>();
  for (const person of people) {
    const label = person.category || fallback;
    groups.set(label, [...(groups.get(label) || []), person]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => Number(a === fallback) - Number(b === fallback) || a.localeCompare(b))
    .map(([label, members]) => ({ label, people: members }));
}
