/**
 * A starting set of common SOP categories, shown as datalist suggestions
 * alongside any category you've already saved a profile for — so the
 * category field has useful, consistent options from the very first
 * generation instead of an empty box with nothing to pick from. This is
 * suggestions, not a restricted enum: typing anything else still works
 * fine, and a category you actually use gets its own saved profile
 * (lib/sop/categoryProfiles.ts) and joins the list too.
 */
export const PRESET_CATEGORIES = [
  "Networking",
  "SysAdmin",
  "Security",
  "User Management",
  "Hardware",
  "Software & Applications",
  "Backup & Recovery",
  "Cloud & DevOps",
  "Facilities & Office",
  "Onboarding & Offboarding",
];
