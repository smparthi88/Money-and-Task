# Money & Tasks – Android

Android app for https://money-tasks.vercel.app (same app as the web version, so phone and laptop share the same data).

Extra on Android: reads bank / UPI transaction SMS (READ_SMS / RECEIVE_SMS), keeps them in a local queue,
and the web app saves them to the `sms_txns` table as a pending **SMS Inbox** list to verify, edit, add or delete.

Build: GitHub Actions (`.github/workflows/build.yml`) builds a signed release APK on every push (artifact `MoneyTasks-apk`).
Secrets: `KS_B64` (base64 release keystore), `KS_PASS`.

## Build on your PC (Android Studio)
1. Unzip, then Android Studio → File → Open → choose the `MoneyTasks-Android` folder. Let Gradle sync finish (first time downloads ~1 GB of tools).
2. Build → Build App Bundle(s) / APK(s) → **Build APK(s)**.
3. Click **locate** in the popup → `app/build/outputs/apk/debug/app-debug.apk`. Copy it to the phone and install (allow "Install unknown apps").
   Or connect the phone with USB debugging and press ▶ Run.
