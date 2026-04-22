## 1. Pre-implementation Test Gate

- [x] 1.1 Build a representative sample matrix for bound sequel releases, covering explicit `Sxx`, bare sequel numerals, ordinal English season names, and cumulative episode numbering cases
- [x] 1.2 Add or expand protective parser and pipeline tests for already-supported season formats, and confirm this baseline suite passes before any implementation work starts
- [x] 1.3 Encode the current failure cases as focused expectations for rename, folder planning, delivery-state, and danmaku season inputs so the target behavior is explicit before coding

## 2. Canonical Season Resolution Implementation

- [x] 2.1 Introduce a canonical season resolver that prioritizes Bangumi-bound subject context and falls back to raw title parsing only when authoritative context is unavailable
- [x] 2.2 Route rename generation, `Season xx` folder planning, delivery-state identity, and danmaku season inputs through the same canonical season/episode result
- [x] 2.3 Add authoritative episode-number normalization for cumulative-number releases when Bangumi episode mapping is trustworthy, with conservative fallback when it is not

## 3. Post-implementation Regression Validation

- [x] 3.1 Make the new sequel-resolution tests pass for bare numeral titles, ordinal English season titles, explicit `Sxx` titles, and cumulative-number cases
- [x] 3.2 Re-run the focused parser, renamer, pipeline, and Bangumi/danmaku regression suites to confirm existing supported formats still pass after the change
- [x] 3.3 Validate a safe sample run or copied-db replay to confirm one bound season no longer splits across multiple `Season xx` directories or duplicate identities

## 4. Documentation and Rollout Notes

- [x] 4.1 Update runtime and operator documentation to explain the authoritative season-resolution priority order, fallback behavior, and the required test-first workflow