# Privacy scan note (final regression)

The regression counts log lines that mention PrintSaathi and contain `no_backup`, `/jobs/` or the test password.
- **API 24, 28 and 30** reported 1–2 such lines.
- **Re-run on API 24 (2026-10-03 02:34 IST):** both lines are Android's own `ActivityManager`, not PrintSaathi:

```
I ActivityManager: START u0 {act=android.intent.action.SEND ... clip={image/jpeg U:content://in.printsaathi.app.fileprovider/private/jobs/x} ...
W ActivityManager: No content provider found for permission check: content://in.printsaathi.app.fileprovider/private/jobs/x
```

**What these lines are:**
- The URI is the **fake hostile URI** the test sender uses (`own-authority` mode), not a real file.
- Older Android versions log the incoming share intent themselves; the app cannot suppress this.
- API 35 and 36 do not log it: 0 hits.

**PrintSaathi's own log lines contain no paths, names or passwords on any level.** `regress.sh` now excludes `ActivityManager` lines from the count.

**Still to check:** whether real WhatsApp URIs reveal anything in this system log. They normally carry a provider ID, not a customer name (USER-CHECKLIST §A).
