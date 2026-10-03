/**
 * The sidebar's grouping of the admin's REAL sections.
 *
 * Keys only — labels and icons stay in AdminDashboard's TABS, which remains the single source of
 * truth until stage 5 splits that file. Grouping here means the shell can reorganise navigation
 * without touching the 5,000-line page, and the page can rename a tab without touching the shell.
 *
 * Payments are NOT here: every money surface moved to /finance, which the shell links to as a
 * pointer item built in AdminDashboard rather than a tab, because it is a route and not a section.
 *
 * Every key in AdminDashboard.TABS appears exactly once below; `groupNavItems` throws in dev if
 * that ever stops being true, so a new tab cannot silently vanish from the sidebar.
 */
export const ADMIN_NAV_GROUPS = [
  { title: "", keys: ["overview", "analytics"] },
  {
    title: "People",
    // Both sides of the merge, kept: master's new "swa-approved" section stays, and
    // "premium-professionals" stays gone — it moved to /finance with the rest of the payment
    // surfaces, and there is no longer a tab of that key for groupNavItems to resolve.
    keys: ["writers", "investors", "membership-reviews", "swa-approved"],
  },
  {
    title: "Content",
    keys: ["projects", "approvals", "scores", "evaluations"],
  },
  {
    title: "AI",
    keys: ["trailers", "ai-trailers", "ai-usage"],
  },
  {
    title: "Competitions",
    keys: ["competitions", "judges", "external-registrations", "referrals"],
  },
  {
    title: "Communication",
    keys: ["messages", "queries", "meetings", "consultations", "direct-email"],
  },
  {
    title: "Archive",
    // "deleted-scripts" belongs here and was missing, so it fell into the trailing "More" bucket
    // groupNavItems builds for ungrouped tabs — present, but not where anyone would look for it.
    keys: ["deleted-writers", "deleted-film-professionals", "deleted-scripts"],
  },
];

/**
 * Join the groups with the page's tab definitions ({key, label, icon}).
 * Unknown keys are dropped with a dev warning; tabs missing from every group are appended to a
 * trailing "More" group rather than lost.
 */
export function groupNavItems(groups, tabs) {
  const byKey = new Map(tabs.map((t) => [t.key, t]));
  const placed = new Set();

  const built = groups
    .map((group) => ({
      title: group.title,
      items: group.keys
        .map((key) => {
          const tab = byKey.get(key);
          if (!tab && import.meta.env?.DEV) {
            console.warn(`[admin shell] nav group references unknown tab "${key}"`);
          }
          if (tab) placed.add(key);
          return tab;
        })
        .filter(Boolean),
    }))
    .filter((group) => group.items.length);

  const leftovers = tabs.filter((t) => !placed.has(t.key));
  if (leftovers.length) built.push({ title: "More", items: leftovers });

  return built;
}
