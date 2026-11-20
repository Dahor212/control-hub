# CONTROL HUB – Internal Control Management

Funkční referenční prototyp systému řízení interních kontrol backoffice penzijní společnosti a zároveň
předloha pro ruční převod do **Microsoft Power Apps + SharePoint Lists + Power Automate**.

**Živá verze:** https://dahor212.github.io/control-hub/ (GitHub Pages, nasazuje se automaticky z větve `main`).

> Všechna data jsou **syntetická**. Aplikace neposílá e-maily a nepotřebuje žádný server ani Microsoft 365 tenant –
> data ukládá do IndexedDB v prohlížeči.

## Spuštění

Požadavky: Node.js 20+ (ověřeno na Node 24), npm.

```powershell
cd control-hub
npm install
npm run dev        # http://localhost:5190
```

Další příkazy:

| Příkaz | Účel |
|---|---|
| `npm test` | 45 automatických testů business logiky a služeb (Vitest) |
| `npm run typecheck` | kontrola typů TypeScript |
| `npm run build` | produkční build do `dist/` (statické soubory, lze hostovat kdekoli) |
| `npm run preview` | náhled produkčního buildu (port 5191) |

Nasazení: push do `main` spustí GitHub Actions (`.github/workflows/deploy.yml`) – testy, build a publikaci na GitHub Pages.
Každý prohlížeč má vlastní lokální data (IndexedDB); data se mezi zařízeními nesdílejí.

Při prvním spuštění se vygenerují demo data vztažená k dnešnímu dni (≈ 2 200 běhů, 6 měsíců historie + 12 měsíců
plánu). Obnova: **Administrace → Demo režim → Obnovit původní demo data**.

## Demo uživatelé

Přepínání v pravém horním rohu (žádná hesla). Uživatel s více rolemi volí aktivní roli tamtéž.

| Uživatel | Role | Útvar / rozsah |
|---|---|---|
| Michal Beneš | Administrátor | vše |
| Kateřina Marková | Koordinátorka (výchozí) | vše |
| Eva Veselá | Manažerka (ředitelka backoffice) | vše |
| Petr Svoboda | Manažer + Schvalovatel | Zpracování příspěvků |
| Lucie Dvořáková | Schvalovatelka + Manažerka | Platby a vypořádání |
| Martin Černý | Schvalovatel + Manažer | Klientské požadavky |
| Tereza Procházková | Schvalovatelka | Výplaty dávek |
| Tomáš Kučera | Schvalovatel + Vlastník kontrol | Data a reporting |
| Jana Nováková | Vlastnice kontrol + Schvalovatelka | Zpracování příspěvků |
| Jakub Horák, Filip Zeman | Vlastníci kontrol | Platby a vypořádání |
| Barbora Králová | Vlastnice kontrol | Klientské požadavky |
| Ondřej Pokorný | Vlastník kontrol | Výplaty dávek |
| Veronika Němcová | Vlastnice kontrol | Data a reporting |
| Alena Růžičková | Auditorka (jen čtení) | vše |

**Přepínání rolí v UI není zabezpečení.** V produkci musí oprávnění vynucovat SharePoint / Microsoft 365
(viz `docs/SHAREPOINT_SCHEMA.md` kap. 7).

## Technologie

React 18, TypeScript 5, Vite 6, Tailwind CSS 4, vlastní komponenty ve stylu shadcn/ui (bez Radix), Lucide ikony,
Recharts (grafy), date-fns (jen formátování; doménová logika má vlastní, na časovém pásmu nezávislou aritmetiku dní),
idb (IndexedDB), pdfmake (skutečné PDF s plnou českou diakritikou, načítá se líně), Vitest (testy běží nad
paměťovým úložištěm se stejnou sémantikou unikátních indexů a atomických zápisů jako IndexedDB). Písmo Inter je přibaleno lokálně (žádné CDN).

## Architektura (4 vrstvy)

```
src/
├── domain/          ① business logika – čisté funkce bez UI a úložiště
│   ├── types.ts         entity = SharePoint seznamy (stejné názvy polí)
│   ├── dates.ts         Europe/Prague, pracovní dny, české svátky, Velikonoce
│   ├── recurrence.ts    pravidla opakování, výskyty, období, RunCode, termíny
│   ├── versioning.ts    generování (FLOW-01), nová verze + náhled dopadu, archivace
│   ├── status.ts        odvozené stavy (po termínu, blíží se…), rekonstrukce stavu k datu
│   ├── workflow.ts      přechody stavů, validace odeslání
│   ├── permissions.ts   role, rozsah, 4 oči
│   ├── metrics.ts       KPI s jednoznačnými definicemi, trendy, problémové kontroly
│   ├── notifications.ts výběr příjemců, prahy, deduplikace, catch-up
│   ├── protocol.ts      neměnný snapshot protokolu + SHA-256
│   └── reports.ts       snapshot měsíčního reportu
├── data/            ② datový přístup – repository nad IndexedDB (nahraditelné SharePointem)
│   ├── backend.ts       IndexedDB + paměťové úložiště (unikátní indexy, atomický update)
│   ├── repository.ts    ListRepository: get/filter/create/update(RowVersion)/bulkPut; append-only audit
│   ├── store.ts         všechny seznamy a knihovny, nastavení, soubory
│   ├── changeBus.ts     notifikace změn + synchronizace mezi záložkami (BroadcastChannel)
│   └── seed*.ts         syntetická demo data
├── services/        ④ automatizace a aplikační akce (simulace Power Automate)
│   ├── controlService.ts       createControl, změna definice, archivace, FLOW-01
│   ├── runService.ts           start/save/submit/approve/return/cancel/override/oprava
│   ├── documentService.ts      přílohy, protokoly (FLOW-04), zjištění
│   ├── notificationService.ts  FLOW-02/03/06/07 (simulace, žádné e-maily)
│   ├── reportService.ts        FLOW-05
│   └── adminService.ts         nastavení, role, číselníky, export/import JSON, reset
├── pdf/             vykreslení PDF protokolu a reportu (pdfmake)
├── powerapps/       registr referencí pro režim „Power Apps Reference“
└── ui/              ③ uživatelské rozhraní (React)
    ├── components/      design systém
    ├── dialogs/         průvodce, změna rozsahu, zjištění, náhledy PDF
    ├── layout/          menu, horní lišta, přepínač uživatele
    └── pages/           13 obrazovek
```

Komponenty UI nevolají úložiště přímo pro zápis – vždy přes služby, které kontrolují oprávnění, validují, zapisují
s kontrolou `RowVersion`, auditují a vytvářejí upozornění. Mapování každé operace na Power Fx / Power Automate je
v `docs/POWERAPPS_MIGRATION.md` kap. G.

## Funkce

- **Dashboard** – 6 interaktivních KPI s proklikem do filtrovaného seznamu, trend 6 měsíců, rozdělení stavů, plnění
  útvarů, nejrizikovější nedokončené, dnešní úkoly, 7 dní, po termínu, dokončené, nedávné změny; 7 filtrů + reset;
  Manažer přepíná Můj pohled / Tým.
- **Moje kontroly** – K provedení, Dnes, Blížící se termín, Po termínu, Rozpracované, Čekající na schválení,
  Vrácené, Dokončené, Naplánované a pro schvalovatele Ke schválení.
- **Registr kontrol** – vyhledávání, filtry, řazení, tabulka/karty, export CSV, průvodce novou kontrolou (7 kroků,
  validace, nápověda, náhled výskytů), archivace, historie verzí s rozdíly.
- **Detail kontroly vs. detail běhu** – jasně odlišené (modrý pruh „Definice“ vs. zelenomodrý „Běh za období“);
  záložky Přehled, Provedení, Přílohy, Historie běhů, Verze, Auditní historie, Nápravná opatření, Protokoly.
- **Opakování** – jednorázově, denně, každý pracovní den, týdně / každých N týdnů (vybrané dny), měsíčně / každých N
  měsíců, čtvrtletně, pololetně, ročně; konkrétní den, poslední den, N-tý pracovní den; posun víkendu/svátku;
  31. den v kratším měsíci; datum ukončení; kontrolované období; 12měsíční horizont; idempotence.
- **Změny** – „pouze tento výskyt“ nebo „tento a všechny následující“ (nová verze s datem účinnosti, náhled dopadu,
  konflikty, potvrzení, povinný důvod).
- **Workflow** – zahájení, checklist, výsledek (5 typů), komentáře, povinné přílohy, nápravná opatření, odeslání ke
  schválení, vrácení, schválení s principem čtyř očí, zrušení, řízená oprava uzavřeného záznamu.
- **Protokoly** – automatické PDF po dokončení/schválení z neměnného snapshotu, verze při opravě, SHA-256 integrita.
- **Kalendář** – měsíc/týden/seznam, plánované datum nebo termín, filtry, svátky, dnes, počty, po termínu, změna
  termínu s volbou rozsahu (bez drag-and-drop).
- **Manažerský přehled** – 7 metrik s definicemi a proklikem, porovnání útvarů, vývoj 12 měsíců, odpovědné osoby,
  rizikovost, TOP problémové kontroly, trend zjištění.
- **Upozornění** – přidělení, blížící se termín, po termínu, eskalace, schvalování, denní souhrn; deduplikace,
  zastavení po dokončení, simulace doručení s chybami a opakováním; „Simulovat denní kontrolu termínů“ ukáže, co by
  systém vytvořil, komu a proč.
- **Reporty** – měsíční report za uzavřený měsíc (snapshot + PDF), verze, archiv, náhled, integrita.
- **Administrace** – role a rozsahy, číselníky, pravidla upozornění, opakování a svátky, auditní log s filtry a
  exportem, technický stav automatizací, demo režim (testovací datum, export/import JSON s validací, reset).
- **Power Apps Reference** – přepínač v horní liště: u prvků zobrazí ID, cílovou obrazovku, control, seznam a flow.
- Souběžné úpravy (RowVersion, i mezi záložkami), měkké mazání, potvrzovací dialogy, srozumitelné chyby,
  přístupnost (role ARIA, klávesnice, kontrast, stav nikdy jen barvou), desktop 1440 px i tablet.

## Dokumentace

| Soubor | Obsah |
|---|---|
| [docs/SHAREPOINT_SCHEMA.md](docs/SHAREPOINT_SCHEMA.md) | seznamy, typy sloupců, indexy, vazby, knihovny, oprávnění |
| [docs/POWERAPPS_MIGRATION.md](docs/POWERAPPS_MIGRATION.md) | mapování obrazovek a komponent, vzorce Power Fx, delegace, postup krok za krokem |
| [docs/POWER_AUTOMATE_FLOWS.md](docs/POWER_AUTOMATE_FLOWS.md) | FLOW-01 až FLOW-07, akce, OData, idempotence, licence |
| [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | stavy, opakování, verzování, eskalace, KPI |
| [docs/SCREEN_MAP.md](docs/SCREEN_MAP.md) | inventář obrazovek a referenčních ID |
| [docs/TEST_SCENARIOS.md](docs/TEST_SCENARIOS.md) | 30 scénářů a stav ověření |
| [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md) | pořadí, oprávnění, rizika, testování |

## Předpoklady a omezení prototypu

- Data žijí jen v prohlížeči (IndexedDB) daného uživatele; sdílení mezi uživateli simuluje přepínač demo účtů.
  Více záložek se synchronizuje (BroadcastChannel) – lze tak testovat souběžnou editaci.
- Automatizace jsou simulace spouštěné tlačítkem nebo při otevření aplikace (FLOW-01 1× denně); nic se neodesílá.
- PDF k historickým (demo) protokolům a reportům se vykreslí ze zmrazeného snapshotu při prvním otevření.
- Upload souborů do 15 MB; soubory se ukládají jako Blob do IndexedDB (limit kvóty prohlížeče).
- SHA-256 otisk je v Power Platform bez premium jen omezeně dostupný – viz POWER_AUTOMATE_FLOWS (FLOW-04).
- Testovací datum slouží jen pro simulaci; v produkci je zdrojem čas serveru.
- Výkon ověřen na ≈ 2 200 bězích; strategie pro 10–50 tisíc běhů v Power Apps je popsána v POWERAPPS_MIGRATION kap. D.
