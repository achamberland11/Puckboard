import { FIELD_INFO } from "./fields.js";

export const TIER_BADGE_CLASS = {
  "S++": "tier-splusplus",
  "S+": "tier-splus",
  S: "tier-s",
  A: "tier-a",
  B: "tier-b",
  C: "tier-c",
  D: "tier-d",
  E: "tier-e",
  F: "tier-f",
};

export function tierBadgeEl(tier, inline = false) {
  if (tier == null || tier === "") return null;
  const badge = document.createElement("span");
  badge.className = `tier-badge ${TIER_BADGE_CLASS[tier] || ""}${
    inline ? " tier-badge-inline" : ""
  }`.trim();
  badge.textContent = tier;
  badge.title = FIELD_INFO.Tier || "";
  return badge;
}
