# Memory / bandwidth stability fixes

Applied in this source package:

- Bounded in-process cache with short TTLs and concurrent-request deduplication.
- Raw CounterHistory is never kept in the cache after processing; only concurrent loads are shared.
- Hourly production/table calculations are cached briefly to prevent every dashboard/user from re-reading Firebase.
- Machine status and machine registry lookups are cached briefly.
- Line and injection-machine list queries use `.lean()` and short caching.
- Dashboard polling intervals were reduced to avoid excessive free-tier traffic.
- Injection machine overview now requests only the selected machine status instead of all machine statuses.
- ChartSection now uses the hourly-production endpoint rather than treating total-output as hourly data.
- Historical analytics/trends refresh less frequently.

Important deployment note:
The supplied backend ZIP contains controllers/services/models/routers but does not contain the server entrypoint (`index.js`), `package.json`, or database bootstrap files. Those files were intentionally not invented. Apply this fixed backend folder over the existing deployed backend project while keeping its existing entrypoint/configuration.

Recommended start command on a Node host:
`node --max-old-space-size=384 index.js`

Do not increase the heap beyond the RAM actually available on the free instance. The application-level fixes are the primary protection; the heap flag is only a safety margin.
