# Hassan Finance — standalone app

A private budget, subscriptions and payoff-plan app that runs on your iPhone home screen and on your PC.
Your data lives in your own free Supabase database and only your login can read it.
This repository holds the app's code only, no financial data.

---

## 1. Create the database (Supabase, free) · ~5 min, on your PC

1. Go to **supabase.com** → **Start your project** → sign in with GitHub.
2. **New project** → name it `hassan-finance` → create a database password (save it in your password manager) → pick the region closest to you → **Create**. Wait ~2 minutes.
3. Left menu → **SQL Editor** → **New query** → paste everything from `setup/supabase.sql` → **Run**. You should see "Success".
4. Left menu → **Authentication** → **Sign In / Providers** → **Email**: turn **Confirm email** OFF → Save.
5. Left menu → **Project Settings** → **API Keys**. Keep this page open; you need two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`, also shown under Project Settings → Data API)
   - **Publishable key** (starts with `sb_publishable_`)

## 2. Put the app online (GitHub Pages, free) · ~3 min

1. On github.com → **New repository** → name `finance` → **Public** → **Create repository**.
2. Click **uploading an existing file** → drag in **all files and the `setup` folder** from this package → **Commit changes**.
3. Repository **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: **main** / **(root)** → **Save**.
4. After ~1 minute your app is at **`https://YOUR-USERNAME.github.io/finance/`**.

(Optional) Edit `config.js` on GitHub (pencil icon) and paste the Project URL and Publishable key, so you never have to type them on a new device.

## 3. Install on your iPhone · ~2 min

1. Open the app link in **Safari** → Share button → **Add to Home Screen** → Add.
2. Open **Finance** from the home screen (not Safari).
3. Paste the Project URL and Publishable key (skip if you filled in `config.js`).
4. Tap **First time? Create account** → your email + a strong password → **Create account**.
5. **Settings** → **Backup** → **Restore from file** → choose `hassan-finance-backup-2026-11-23.json`. Your cards, plan, timeline and subscriptions appear.
6. Back in Supabase → **Authentication** → **Sign In / Providers** → turn **Allow new users to sign up** OFF. Now nobody else can create an account in your database.

On your PC, open the same link and sign in with the same email and password.

## 4. Automatic bank SMS (iPhone Shortcuts) · ~5 min

In the app: **Settings → iPhone SMS automation → Show my Shortcut settings**. Keep that screen open; it has the values to copy.

**A. Create the shortcut**
1. Open **Shortcuts** → **+** → rename it **Finance SMS**.
2. Add the action **Get Contents of URL**. Tap the URL and paste the **URL** from the app.
3. Tap the arrow (›) to expand:
   - **Method**: `POST`
   - **Headers** → Add new header: `apikey` = your publishable key (copy from the app). Add another: `Content-Type` = `application/json`
   - **Request Body**: `JSON` → Add new field → **Text** → key `k`, value = the **k** value from the app.
     Add new field → **Text** → key `body`, value: tap it and choose the variable **Shortcut Input**.
4. Done.

**B. Run it whenever a bank SMS arrives**
1. Shortcuts → **Automation** → **+** → **Message**.
2. **Message Contains**: `SAR` → choose **Run Immediately** → Next.
3. **New Blank Automation** → add action **Run Shortcut** → pick **Finance SMS** → tap the arrow and set Input to **Shortcut Input** → Done.
4. Repeat steps 1–3 with **Message Contains**: `بـ` (catches Arabic bank messages).

New bank SMS now land in the app automatically. Open the app and they are added, categorised and matched to your cards.
One-time codes (OTP / رمز التحقق) are rejected by the database and never stored.
If a bank's SMS doesn't arrive, add another automation with a word that bank always uses, or paste the SMS in **Add**.

## Updating the app later
Replace the changed files on GitHub (Add file → Upload files). Your data is not touched.

## Backups
Settings → Backup → **Download backup** once a month and keep the file somewhere safe (iCloud Drive / Google Drive).
