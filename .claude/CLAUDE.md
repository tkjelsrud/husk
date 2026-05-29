# Husk — prosjektinformasjon for Claude

## Teknisk stack

Dette er **ikke** et npm/Node.js-prosjekt. Ikke kjør `npm`, `npx`, `yarn` eller `pnpm`.

- **Frontend**: Vanilla JS + Firebase JS SDK (ESM via CDN), Bootstrap 5, hostet via GitHub Pages
- **Backend**: Python (`python -m pytest` for tester, `pip`/`venv` for avhengigheter)
- **Database**: Firebase Firestore
- **Auth**: Firebase Auth (Google OAuth)
- **Frontend-tester**: Finnes i `test/` — kjøres med et eget test-oppsett (ikke npm)
- **Backend-tester**: `python -m pytest backend/tests/`

## Viktige regler

- Kalender-sync (Google Calendar) kjøres kun for `family`-kategorien
- Entries med eksplisitt kategori (ikke `unknown` og ikke `family`) settes til `processed: true` ved oppretting i frontend — backend prosesserer dem aldri
- Backend klassifiserer ikke kategori — det er brukerens jobb via UI
