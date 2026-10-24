# Gate re-review N3 — WebView gate while files are still arriving (API 30 emulator, WebView 83, 2026-10-16)

Slow sharing app: test sender mode `six-slow` (six different photos, each sent in 4 parts over ~2 s, granted
read access like WhatsApp). Script: interfere 1.5 s into the copy, read the intake journals after ~25 s.

**Before the fix** (build 8710cff + web/N2 changes):
- Back on the gate closed it and left **MainActivity in front showing the old web engine's blank page**
  (`api30-gate-back-blank-before.png`: the body is one flat colour). Files were not lost in these runs
  (Capacitor kept the next Back), but the shopkeeper would have seen an empty screen and then the app vanishing.
- Raw results:
```
{"scenario":"back","intakes":[{"files":6,"distinct":6,"problems":""}],"permissionDenials":0,"gateScreens":1}
{"scenario":"icon","intakes":[{"files":6,"distinct":6,"problems":""}],"permissionDenials":0,"gateScreens":1}
{"scenario":"twice","intakes":[{"files":6,"distinct":6,"problems":""}],"permissionDenials":0,"gateScreens":1}
```

**After the fix** (MainActivity re-shows the gate whenever it comes to the front while gated; Back on the gate or on
MainActivity moves the app to the background instead of finishing anything):
```
{"scenario":"back","frontAfter":"com.google.android.apps.nexuslauncher/.NexusLauncherActivity","intakes":[{"files":6,"distinct":6,"problems":""}],"permissionDenials":0,"gateScreens":2}
{"scenario":"icon","frontAfter":"com.google.android.apps.nexuslauncher/.NexusLauncherActivity","intakes":[{"files":6,"distinct":6,"problems":""}],"permissionDenials":0,"gateScreens":2}
{"scenario":"twice","frontAfter":"com.google.android.apps.nexuslauncher/.NexusLauncherActivity","intakes":[{"files":6,"distinct":6,"problems":""}],"permissionDenials":0,"gateScreens":2}
```
- `frontAfter` = the launcher: Back left the app; nothing was finished; all 6 distinct files arrived; 0 permission
  denials. (`gateScreens` counts one live gate plus an already-finishing record from an earlier task.)
- App icon tapped mid-copy (traced by hand): the gate is in front, MainActivity stays under it until the copy ends,
  then finishes; one live gate remains.
- Two shares of the same files within 60 s are one intake (PLAN §D2b), as designed.

Not proven: a real phone with an old WebView (none available); Android 13+ predictive-back gesture on the gate
(the AndroidX back dispatcher is used, which handles it).
