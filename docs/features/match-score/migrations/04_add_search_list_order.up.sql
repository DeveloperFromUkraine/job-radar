-- match-score · search state keeps the owner's chosen list order (spec AC-11). Nullable, so no backfill:
-- NULL = never chosen = newest first. Values newest | best_match, checked in TypeScript.
ALTER TABLE `search_state` ADD `list_order` text;
