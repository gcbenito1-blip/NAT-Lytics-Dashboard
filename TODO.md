# TODO

## Goal
Fix `Firestore getTeacherSessions` failing with `Missing or insufficient permissions`, improving diagnostics and avoiding transient auth timing issues.

## Steps
- [x] Add detailed diagnostics in `src/services/sessionService.ts` for `getTeacherSessions` (include auth uid + error info).
- [x] Adjust merge/fallback behavior to avoid misleading warnings (keep local fallback, but log clearly).

- [x] Implement a one-time retry in `src/pages/TeacherOverview.tsx` after auth/user is available (or after a short delay) when initial Firestore read fails.
- [ ] Run TypeScript build/lint (if available) to ensure no type errors.


