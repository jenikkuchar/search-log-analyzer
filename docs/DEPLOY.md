# Nasazení na GitHub Pages s doménou search-log-analyzer.jan-kuchar.cz

Aplikace je čistě statická (Vite + React), build se nasazuje přes GitHub Actions
(`.github/workflows/deploy.yml`) při každém pushi do `main`. Soubor `public/CNAME`
se kopíruje do `dist/` a obsahuje vlastní doménu.

## 1. DNS ve WEDOS (doména jan-kuchar.cz)

WEDOS administrace → **Domény** → `jan-kuchar.cz` → **DNS záznamy** → Přidat záznam:

| Název (subdoména)     | TTL  | Typ   | Data                    |
|-----------------------|------|-------|-------------------------|
| `search-log-analyzer` | 3600 | CNAME | `jenikkuchar.github.io.`|

- Do pole „Název“ zadej jen `search-log-analyzer` (bez `.jan-kuchar.cz`).
- Na tomto názvu nesmí existovat jiný záznam (A, AAAA, TXT…), jinak CNAME nejde přidat.
  Pokud ho WEDOS vytvořil automaticky (např. při zřízení subdomény ve webhostingu), smaž ho.
- Pokud máš ve WEDOS hostingu pro tuto subdoménu založený web/alias, odeber ho –
  obsah bude servírovat GitHub, ne WEDOS.
- Uložit a **potvrdit změny DNS** (WEDOS je aplikuje až po potvrzení, propagace do ~1 h).

Kontrola: `dig search-log-analyzer.jan-kuchar.cz +short` → má vrátit
`jenikkuchar.github.io.` a IP adresy 185.199.108–111.153.

### (Doporučeno) Ověření domény na GitHubu
Chrání před převzetím subdomény někým jiným.
GitHub → avatar → **Settings → Pages → Add a domain** → zadej `jan-kuchar.cz`.
GitHub zobrazí TXT záznam; ve WEDOS přidej:

| Název                                  | Typ | Data             |
|----------------------------------------|-----|------------------|
| `_github-pages-challenge-jenikkuchar`  | TXT | (kód z GitHubu)  |

Potvrď změny DNS a na GitHubu klikni **Verify**.

## 2. GitHub Pages v repozitáři

1. Mergni tuto větev do `main`.
2. Repozitář → **Settings → Pages** → *Build and deployment* → **Source: GitHub Actions**.
3. Ověř, že workflow „Deploy to GitHub Pages“ v záložce **Actions** doběhl zeleně
   (případně ho spusť ručně přes *Run workflow*).
4. **Settings → Pages → Custom domain**: `search-log-analyzer.jan-kuchar.cz` → Save
   (při deploye přes Actions se CNAME soubor nečte, doménu je nutné zadat zde).
5. Po úspěšné DNS kontrole (může trvat až desítky minut, než GitHub vydá certifikát)
   zaškrtni **Enforce HTTPS**.

## Poznámky

- `vite.config.ts` nemá nastavený `base` – při vlastní doméně běží aplikace v kořeni `/`,
  což je správně. (Bez vlastní domény by na `jenikkuchar.github.io/search-log-analyzer/`
  bylo nutné nastavit `base: '/search-log-analyzer/'`.)
- `GEMINI_API_KEY` se do buildu nedává – aplikace ho nepoužívá a na GitHub Pages by
  jakýkoli klíč vložený do bundlu byl veřejně čitelný.
- Free GitHub účet umí Pages jen u **veřejného** repozitáře (u privátního je potřeba Pro).
