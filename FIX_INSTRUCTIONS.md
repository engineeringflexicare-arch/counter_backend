# Root cause of the crash / 500 errors in your log

Every single error in `errors_log.txt` — the `hourly-production` 500s, the
`Production Gap Error`s, the `Error fetching output`, the `Error fetching
machine details`, all of it — traces back to **one** underlying Firebase
error, repeated for every machine and every date:

```
Error: Index not defined, add ".indexOn": "timestamp",
for path "/Machines/Machine_01/CounterHistory", to the rules
```

Your backend code (`Esp32DataController.js`) is already written correctly —
it pages through `CounterHistory` in small chunks so it never loads a whole
day into memory, which is why your `RSS`/`heap` numbers in the log are
actually fine (108-119MB, stable, not climbing). The crash isn't a memory
leak or a code bug. It's a **missing index in your Firebase Realtime
Database security rules**. Every `orderByChild("timestamp")` query needs a
matching `.indexOn` rule, or Firebase refuses the query outright — and
because it fails instantly, the frontend keeps retrying on every page load,
which is what's chewing through your free-tier bandwidth/CPU quota.

This is a **one-time console change**, not something a backend code fix can
do for you (the Node app has no permission to edit its own database's
security rules — that's by design, for safety).

## The fix (2 minutes, no downtime, no redeploy needed)

1. Go to the [Firebase Console](https://console.firebase.google.com/) →
   your project → **Realtime Database** → **Rules** tab.
2. Find the `Machines` section of your existing rules (or `Machines/$machineId`
   if you already scope rules per machine).
3. Add a `"CounterHistory": { ".indexOn": "timestamp" }` block **inside** it,
   alongside whatever `.read`/`.write` rules are already there — do **not**
   delete or replace your existing rules, just merge this in. The exact
   shape to add is in `database.rules.snippet.json` in this folder:

   ```json
   "Machines": {
     "$machineId": {
       "CounterHistory": {
         ".indexOn": "timestamp"
       }
     }
   }
   ```

4. Click **Publish**. The index builds automatically; existing 500s should
   stop within a few seconds of publishing.

## What I also changed in the code (defensive, not a replacement for step 1-4)

- `utils/memoryCache.js`: failed Firebase/Mongo calls are now cached as a
  fast-failing rejection for a few seconds, so a burst of dashboard tabs/
  polling during an outage (like this missing-index one) can't all hammer
  Firebase with the same doomed query at once. This directly protects your
  free-tier bandwidth/read quota during any future outage, not just this one.
- `controllers/Esp32DataController.js`: this specific "Index not defined"
  error is now detected and logged once every 60 seconds with a direct
  pointer to this fix, instead of a full stack trace on every single
  request (which is most of what was flooding your terminal).

Both changes are safe no-ops once the index above is added — they only
change behavior when something is actually failing.
