# UI rearrangement — rulings and deferred minors

- Ruling: execute without waiting for plan review — user said "proceed" and opted out of questions — cost: rework if layout calls differ from their taste.
- Task 2: Ruling: scoped re-review of fix round 1 done by controller (7-line source diff; width=min(80%,128*w/h px)+aspect-ratio keeps ratio, height ≤128) instead of a dispatch — tiny diff, implementer showed tests RED on revert — cost: a missed edge in the e2e test assertions
- Task 3: Ruling: implementer strengthened plan's test (asserted aside right edge 1280 + width 320) because plan's assertions held on old layout — plan test was vacuous — cost: none
- Task 4: review spec ✅, quality changes needed (NewDesign no viewer guard; error hidden at 390). Fix round 1 → resumed implementer (+ brand-kits copy, 390 checks). Ruling: viewer on /new gets disabled controls + note, not redirect — mirrors Home — cost: trivial
- Task 5: Ruling: Shapes/Visuals tabs disabled (not hidden) during path edit — panels themselves hidden, reviewer agrees — cost: none
- Task 6: Ruling: implementer added Properties 'Delete' (removeNodes, hidden for read-only) since brief listed delete among actions but none existed — real working action, mirrors keyboard Delete — cost: one extra button
- Final e2e run: 52/53; library.spec.ts:30 failed once at first PNG upload API (400, server) — branch touches no server/packages code; library spec --repeat-each=3 → 21/21. Ruling: pre-existing cold-start flake in upload API, not caused by this branch — cost: a real upload bug left for a later fix

## Deferred minors
- Task 1: minor (parked): mobile-bar test passes on desktop layout; menu stays open on Tab-out; no max-height on menu; .side no overflow on short viewports — see task-1-review.md
- Task 3: minor (parked): .tiles-sq custom tiles grow taller / long names overflow (theme.css:146); Shapes tablist no arrow keys; phone Library aside below grid so details off-screen after tap
- Task 4: minor (parked): none beyond the above
- Task 5: minor (parked): shortcut test passes without blur; focus lost after tab activation; rail toggle-back untested; .ell can clip "Reload to get latest" button on narrow; partial tab semantics; pen-finish Enter blocked while tab focused; tabs overflow at 390
- Task 6: minor (parked): Properties Delete removes locked layers (consistent w/ keyboard); duplicate-count test not row-scoped; no undo test for Properties Delete; empty-state page size not rounded
- Final: minor (deferred): Library/Shapes workspace switch not e2e-covered; /new controls enabled until workspace list loads; dead/duplicate CSS (IconLayers, .ed-tab≈.tab-u, .split-main padding, .nav-on)
