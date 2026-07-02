# StockMaster v2.0 — Setup Uputstvo

## Šta dobijaš
Kompletan React projekat spreman za:
- Lokalni development (tvoj računar)
- Supabase baza (online, besplatno)
- Netlify deployment (online hosting, besplatno)
- PWA (instalabilno na telefon)

---

## Korak 1 — Node.js
1. Idi na **nodejs.org** → preuzmi LTS verziju → instaliraj
2. Proveri: otvori `cmd` i otkucaj `node --version` (treba da vidiš `v20.x.x`)

---

## Korak 2 — Supabase baza
1. Idi na **supabase.com** → prijavi se sa GitHub nalogom
2. Napravi novi projekat: ime `stockmaster`, region Frankfurt
3. Kad se kreira, idi u: **SQL Editor** → New query
4. Nalepi sadržaj fajla `setup/01_schema.sql` → klikni **Run**
5. Nalepi sadržaj fajla `setup/02_seed.sql` → klikni **Run** (test podaci)
6. Idi u: **Project Settings → API**
7. Kopiraj:
   - **Project URL** (npr. `https://abcdefgh.supabase.co`)
   - **anon public** key

---

## Korak 3 — Konfiguracija
1. U folderu projekta napravi fajl `.env` (kopiraj iz `.env.example`)
2. Popuni:
```
VITE_SUPABASE_URL=https://TVOJ_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=TVOJ_ANON_KEY
```

---

## Korak 4 — Pokretanje lokalno
```bash
# Otvori cmd u folderu projekta, pa:
npm install
npm run dev
```
Otvori browser: **http://localhost:5173**

---

## Korak 5 — Kreiranje prvog vlasnika naloga
1. Idi u Supabase Dashboard → **Authentication → Users** → "Invite user"
2. Unesi svoju email adresu
3. Proveri email i postavi lozinku
4. Idi u **Table Editor → profiles** → nađi svog korisnika
5. Promeni `role` sa `worker` na `owner`

---

## Korak 6 — Deploy na Netlify
1. Push projekat na GitHub (bez `.env` fajla — `.gitignore` ga štiti)
2. Idi na **netlify.com** → "Add new site" → "Import from Git" → izaberi repo
3. Build settings su automatski (Vite ih prepoznaje)
4. Idi u: Site Settings → Environment variables → dodaj:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Klikni "Deploy" — sajt je live za ~2 minute!

---

## Folder struktura
```
stockmaster/
├── setup/
│   ├── 01_schema.sql    ← Baza podataka (tabele + sigurnost)
│   └── 02_seed.sql      ← Test podaci (20 artikala)
├── src/
│   ├── components/      ← Sidebar, Card, Icon, Layout...
│   ├── pages/           ← Sve stranice aplikacije
│   ├── hooks/           ← useAuth.jsx
│   ├── lib/             ← supabase.js
│   └── main.jsx
├── .env.example         ← Kopiraj u .env i popuni
└── package.json
```
