# AIHospiceOS — Installable Web App, Google Sheets backend

The frontend is a Progressive Web App (installable on phone and computer).
The backend is a Google Sheet + Apps Script — no server to maintain, and
anyone on your team can edit scores or regulatory items directly in the
spreadsheet and see it live in the app within seconds.

```
Google Sheet  →  Apps Script Web App (JSON API + AI proxy)  →  PWA frontend
```

## 1. Set up the Google Sheet backend (~3 minutes)

1. Create a new Google Sheet (sheets.new). Name it whatever you like.
2. **Extensions → Apps Script.** Delete the placeholder code, paste in the
   contents of `apps-script/Code.gs` from this folder.
3. In the Apps Script editor, select the `setupSheet` function from the
   dropdown next to Run, and click **Run**. Approve the permissions prompt.
   This creates and seeds the tabs: `Scores`, `Factors`, `Actions`,
   `RegUpdates`, `RegChecklist`.
4. Go back to the Sheet — you'll see the new tabs with starter data. Edit
   any cell, add rows, delete rows — the app reads whatever is there.
5. **(Optional, for live AI features)** In the Apps Script editor:
   **Project Settings → Script Properties → Add script property.**
   Name: `ANTHROPIC_API_KEY`, value: your key from console.anthropic.com.
6. **Deploy → New deployment → Web app.**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click Deploy, authorize again if asked.
7. Copy the `/exec` URL it gives you.

## 2. Point the frontend at your Sheet

Open `src/config.js` and paste the URL:
```js
export const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycb.../exec";
```
Without this, the app runs fine on bundled sample data — useful for a demo
before your Sheet is ready. A small badge in the Dashboard and Regulatory
Watch tabs shows whether you're looking at live Sheet data or sample data.

## 3. Deploy the frontend

### Option A — Vercel CLI
```
npm install -g vercel
cd app
vercel deploy --prod
```

### Option B — GitHub + Vercel dashboard (no CLI)
1. Push this folder to a new GitHub repo.
2. vercel.com → **Add New Project** → import the repo.
3. Framework preset: Vite. Deploy.

No environment variables needed on Vercel — the API key lives in Apps
Script's Script Properties instead, so it's never in your frontend code
or bundle.

## 4. Install it like an app

- **iPhone/iPad (Safari):** open the link → Share → *Add to Home Screen*.
- **Android/Chrome:** open the link → *Install* banner, or menu → *Install app*.
- **Desktop (Chrome/Edge):** install icon in the address bar, or menu → *Install AIHospiceOS…*.

## Changing content later

Nothing is set in stone — edit the Sheet any time:
- **Scores** tab: id, label, icon (see icon names in `App.jsx`'s `ICONS` map), score, trend, summary
- **Factors** tab: category_id (matches a Scores id), weight, label, status (`good`/`warn`/`risk`), detail
- **Actions** tab: category_id, action_text
- **RegUpdates** tab: id, date, source, tag, severity (`high`/`medium`/`low`), title, summary, impact
- **RegChecklist** tab: reg_id (matches a RegUpdates id), item_text

Changes appear the next time someone opens or refreshes the app — no
redeploy required.

## Local development
```
npm install
npm run dev
```
