# Putting PrintSaathi on the shopkeeper's phone

For you (the owner). About 30 minutes the first time. You need a PC with this project, a USB cable, the shopkeeper's phone, the shop printer, A4 paper and 4×6 photo paper.

## 0. The release key: back it up, never make a second one
PrintSaathi's signing key lives in `C:\Users\<you>\.printsaathi\` (made once, on 17 Oct 2026). Its fingerprint is pinned in `android/release-cert.sha256`.

- **Back up the whole folder now:** a USB stick and a private cloud folder. It holds the key and its password, so keep the backups private.
- The shopkeeper's phone accepts updates only when they are signed with this key. The build checks the fingerprint and refuses any other key.
- **If a build says "the key folder is missing on this PC" or "not the PrintSaathi release key":** restore the folder (next section).
  - **Do not** make a new key.
  - **Do not** uninstall the app on the shopkeeper's phone: that deletes the app's settings and jobs.

### Restore the key on a new PC
1. Copy the backed-up `.printsaathi` folder to `C:\Users\<you>\.printsaathi\` on the new PC. The folder works on any PC.
   - It can also go anywhere outside the project. Then set `PRINTSAATHI_SIGNING` to the full path of its `signing.properties`.
2. Install Node 22+ and Android Studio (for its Java and Android SDK).
3. In the project folder: `npm ci`.
4. Continue with step 1 below.

## 1. Build the app
```
npm run android:release
```
It ends with `Release APK OK: signed with the pinned PrintSaathi key … → release\PrintSaathi-1.0.<n>-<code>.apk`. Next to the APK is a `-mapping.txt` file. Keep both; the mapping file reads crash reports.

## 2. Turn on USB debugging on the shopkeeper's phone (once)
1. **Turn on Developer options:** find the build number and tap it 7 times, until it says "You are now a developer".

   | Phone | Where |
   |---|---|
   | Most phones | Settings → About phone → **Build number** |
   | Samsung | Settings → About phone → Software information → **Build number** |
   | Xiaomi / Redmi / POCO | Settings → About phone → **MIUI version** (or **OS version**) |
   | Oppo / Realme | Settings → About phone → Version → **Build number** |
   | Vivo | Settings → More settings → About phone → Software version |

2. **Turn on USB debugging** in Developer options. Developer options are usually under Settings → System → Developer options, or Settings → Additional settings. On Android 7 they are directly in Settings.
   - **Xiaomi / Redmi / POCO:** also turn on **Install via USB**. It needs a SIM card and a Mi account.
3. **Connect the cable.** On the phone, tap **Allow** (tick "Always allow from this computer").

## 3. Install (and later: update)
```
node scripts/device/install.mjs --release
```
- It prints the phone's model and Android version, then "Success".
- **Oppo, Vivo or Realme** may show "Install this app?" on the phone: tap **Install** quickly.
- **Updates** use the same command; the shopkeeper's settings and jobs stay.
- If it says the phone has **an earlier test copy**, that is a copy you installed for testing. Uninstall that copy once, then run the command again. This never happens with the real app.
- After installing, you can turn USB debugging off again (Developer options).

## 4. Set up on the phone (with the shopkeeper watching)
1. **Printing app:** Android 7 has none built in. From the Play Store, install the **Brother Print Service Plugin** (or **Mopria Print Service**). Open it once, and make sure it is **on** under Settings → Connected devices → Printing. If Home says "No printing app on this phone", this step is missing.
2. **Open PrintSaathi:** the four first-start steps appear once. Go through them with the shopkeeper.
3. **Test pages** (Settings → Print a test page):
   - **A4**, choosing the shop printer at the top of Android's print screen. Measure: the black square is 5.0 cm.
   - Then **4×6 photo paper**, with 4×6 paper loaded. This sets up 4×6 for passport photos and photo jobs.
4. **Pin PrintSaathi in WhatsApp's share list:** in WhatsApp, select a photo → Share → long-press PrintSaathi → **Pin** (where the phone offers it).
5. **Settings:**
   - shop name;
   - passport prices;
   - "Delete customer files after" (1 day is the default).
6. **Screen lock:** make sure the phone has one (customer files stay on it for a day).

## 5. Then
- **The checks:** USER-CHECKLIST §A–§Q on the real phone and printer. Start with §G (the shopkeeper's first WhatsApp photos), then §J (passport ruler) and §Q (the shopkeeper's session).
- **The two-week trial:** USER-CHECKLIST §R.
- **If something goes wrong:** Settings → **Send problem report** → send it to yourself on WhatsApp. It holds no customer photos, names or files.
