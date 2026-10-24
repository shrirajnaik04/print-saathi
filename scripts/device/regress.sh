#!/bin/sh
# Phase-gate device regression on one emulator: boot, install debug + tests + sender, push fixtures, run the full
# instrumentation suite and the share matrix, summarise honestly (passed / failed / skipped), shut down.
# Usage: sh scripts/device/regress.sh <avd> <port> <label> <outDir>
set -u
AVD=$1; PORT=$2; LABEL=$3; OUT=$4
SDK=${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}
ADB="$SDK/platform-tools/adb"; EMU="$SDK/emulator/emulator"
S=emulator-$PORT
mkdir -p "$OUT"
# The phone must run today's web app, not whatever `npm run android:sync` copied last time (Phase 4 finding).
node scripts/device/web-fresh.mjs || { echo "$LABEL: web app in the Android build is out of date"; exit 1; }
("$EMU" -avd "$AVD" -port "$PORT" -no-window -no-audio -no-boot-anim -no-snapshot-save -gpu swiftshader_indirect > "$OUT/.emulator-$LABEL.log" 2>&1 &)
i=0
until "$ADB" -s "$S" shell pm path android 2>/dev/null | grep -q '^package:'; do
  i=$((i + 1)); [ $i -gt 120 ] && { echo "$LABEL: boot timeout"; exit 1; }; sleep 5
done
sleep 15
# A release build (another signing key) from a release check would block the debug install: remove it first.
"$ADB" -s "$S" uninstall in.printsaathi.app > /dev/null 2>&1
ANDROID_SERIAL=$S node scripts/android-env.mjs :app:installDebug :app:installDebugAndroidTest :sharesender:installDebug > "$OUT/install-$LABEL.txt" 2>&1 \
  || { echo "$LABEL: install failed"; "$ADB" -s "$S" emu kill; exit 1; }
node scripts/device/push-fixtures.mjs "$S" tests/fixtures-large/108mp.jpg tests/fixtures-large/108mp-420.jpg \
  tests/fixtures-large/108mp-prog-odd.jpg tests/fixtures-large/48mp-odd.png > /dev/null
echo "Android $("$ADB" -s "$S" shell getprop ro.build.version.release | tr -d '\r') (API $("$ADB" -s "$S" shell getprop ro.build.version.sdk | tr -d '\r'))" > "$OUT/device-$LABEL.txt"
"$ADB" -s "$S" logcat -c
"$ADB" -s "$S" shell am instrument -w -r in.printsaathi.app.test/androidx.test.runner.AndroidJUnitRunner > "$OUT/instrumentation-$LABEL.txt" 2>&1
# The screen-reader journey test turns TalkBack on and puts the settings back itself; if the app's process died during
# it, TalkBack would stay on for the share matrix: a test emulator has no accessibility service of its own.
"$ADB" -s "$S" shell settings delete secure enabled_accessibility_services > /dev/null 2>&1
"$ADB" -s "$S" shell settings put secure accessibility_enabled 0 > /dev/null 2>&1
# A crash must leave a cause behind (Phase 4: one "Process crashed" on API 35 that never came back). The crash buffer
# holds stack traces only; tests use synthetic files.
"$ADB" -s "$S" logcat -b crash -d > "$OUT/crash-log-$LABEL.txt" 2>&1
# The print file the device made (PlanRenderDeviceTest), read back independently by pdf.js: boxes within 0.1 pt.
"$ADB" -s "$S" exec-out run-as in.printsaathi.app cat files/render-check/print.pdf > "$OUT/render-$LABEL.pdf" 2>/dev/null
"$ADB" -s "$S" exec-out run-as in.printsaathi.app cat files/render-check/expected.json > "$OUT/render-expected-$LABEL.json" 2>/dev/null
node scripts/device/render-check.mjs "$OUT/render-$LABEL.pdf" "$OUT/render-expected-$LABEL.json" > "$OUT/render-check-$LABEL.json" 2>&1
echo "render check exit $?" >> "$OUT/device-$LABEL.txt"
rm -f "$OUT/render-$LABEL.pdf"
"$ADB" -s "$S" shell am start -n in.printsaathi.app/.MainActivity > /dev/null; sleep 6
EVIDENCE="$OUT/share-matrix-$LABEL.json" node scripts/device/share.mjs "$S" > /dev/null 2>&1
echo "share matrix exit $?" >> "$OUT/device-$LABEL.txt"
# Privacy: PrintSaathi's own log lines must never carry private paths or the test password.
# System services that log the share matrix's own deliberately hostile test URIs (e.g. content://<app>.fileprovider/
# private/jobs/x) are not the app's lines: excluded, like ActivityManager.
"$ADB" -s "$S" logcat -d | grep -E "PrintSaathi|printsaathi" | grep -v -E " ActivityManager: | UriGrantsManagerService: " | grep -E "no_backup|/jobs/|RAMA1965" > "$OUT/privacy-hits-$LABEL.txt"
echo "privacy hits in app log lines: $(wc -l < "$OUT/privacy-hits-$LABEL.txt" | tr -d ' ')" >> "$OUT/device-$LABEL.txt"
rm -f "$OUT/.emulator-$LABEL.log"
node scripts/device/instrumentation-summary.mjs "$OUT/instrumentation-$LABEL.txt"
echo "$LABEL share: $(grep -o '"verdict": "[A-Z]*"' "$OUT/share-matrix-$LABEL.json" | sort | uniq -c | tr '\n' ' ')"
cat "$OUT/device-$LABEL.txt"
"$ADB" -s "$S" emu kill > /dev/null 2>&1; sleep 8
