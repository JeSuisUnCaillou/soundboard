# Pass 1

Head reviewed: ecbeded (the change), whole branch against main.

- docs/architecture.md:43 still showed rows: 3 in the board format (both reviewers): fixed in e2f43e1. Text, not blocking.
- docs/status.md says 25 tests, bugs reviewer counted 23: rejected, the suite runs 50 tests across two projects, 25 each (`npm run test:e2e`).
- No code finding. The new default is covered by "a new board starts three columns by four rows".

Reviewed head: e2f43e1d51fc2c372113172d52e35664138130b9
