# IMPLEMENTATION_ROADMAP – postup převodu do Microsoft Power Platform

## 1. Doporučené pořadí

| Fáze | Obsah | Výstup | Závisí na | Odhad* |
|---|---|---|---|---|
| 0. Příprava | Schválení architektury (IT, bezpečnost, compliance), prostředí Power Platform, DLP politika „jen standardní konektory“, servisní účet, SharePoint web | zápis o schválení, prostředí | – | 1–2 týdny (organizační) |
| 1. Datová vrstva | Seznamy A–M, knihovny, indexy, unikátní sloupce, ověření, skupiny a oprávnění, číselníky a nastavení | prázdné a zabezpečené úložiště | 0 | 3–5 dní |
| 2. Generování výskytů | FLOW-01 (plánovaný + Power Apps V2), testy idempotence, svátky | běhy na 12 měsíců | 1 | 4–6 dní |
| 3. Provedení a schválení | `scrMyControls`, `scrRunDetail` (checklist, výsledek, přílohy, 4 oči), FLOW-UploadEvidence, audit | provozně použitelné jádro | 1, 2 | 6–8 dní |
| 4. Protokoly | FLOW-04 (snapshot, HTML → PDF, složky), řízená oprava | PDF protokoly | 3 | 3–5 dní |
| 5. Katalog a změny | `scrControlRegister`, `scrControlDetail`, `scrControlWizard` (7 kroků, náhled dopadu přes FLOW-01 Preview/ApplyVersion), archivace | správa definic s verzováním | 2 | 6–8 dní |
| 6. Upozornění | FLOW-02, FLOW-03, FLOW-06, FLOW-07, sdílená schránka, digest | e-maily, eskalace | 3 | 4–6 dní |
| 7. Přehledy | `scrDashboard`, `scrCalendar`, `scrManagement`, `scrRunList`, `scrFindings` | manažerský dohled | 3 | 5–7 dní |
| 8. Reporting | FLOW-05, `scrReports` | měsíční reporty | 4, 7 | 3–4 dny |
| 9. Administrace | `scrAdministration` (role, číselníky, pravidla, audit, technický stav) | konfigurovatelnost | 1, 6 | 3–4 dny |
| 10. Test a nasazení | UAT dle TEST_SCENARIOS, zátěžový test delegace (> 5 000 a 50 000 běhů), migrace dat, školení | produkční provoz | vše | 1–2 týdny |

\* Odhad pro jednoho zkušeného tvůrce Power Apps, který vzorce přebírá z dokumentace.

Postup je navržen tak, aby **po fázi 3 existoval minimální použitelný produkt** (kontroly se generují, provádějí,
schvalují a auditují) a zbytek se přidával bez přestavby.

## 2. Nezbytná oprávnění a licence

| Co | Kdo poskytne | Poznámka |
|---|---|---|
| SharePoint web + vlastník webu | správce SharePointu | pro založení seznamů, skupin a vlastních úrovní oprávnění |
| Prostředí Power Platform (Maker role) | správce Power Platform | ideálně samostatné prostředí „Interní kontroly“ se zálohou a DLP |
| Licence Microsoft 365 s Power Apps/Power Automate for Office 365 | uživatelé, servisní účet | stačí pro standardní konektory |
| Servisní účet s licencí a poštovní schránkou | IT | vlastník flow; vyšší limity požadavků doporučeny |
| Sdílená schránka + Send As pro servisní účet | správce Exchange | odesílání upozornění |
| OneDrive pro servisní účet | IT | dočasné soubory pro převod HTML → PDF |
| (volitelně) Microsoft Purview retention label „Záznam“ | compliance | neměnnost protokolů a auditu |
| (volitelně) Office Scripts | správce M365 | výpočet SHA-256 otisku snapshotů |
| Solutions / environment variables | správce Power Platform | čistší ALM; bez nich ruční přenos mezi prostředími |

Funkce, které by vyžadovaly **premium** nebo zvláštní oprávnění, a navržená náhrada:

| Funkce | Premium varianta | Náhrada bez premium |
|---|---|---|
| PDF z Word šablony | Word Online (Business) – Populate template | HTML → OneDrive Convert file |
| Volání vlastní logiky | HTTP / Azure Functions | výpočty ve flow (výrazy, Do until) |
| Relační data, transakce | Dataverse | SharePoint + GUID + `RowVersion` + `If-Match` |
| Sekvenční čísla | Dataverse autonumber | flow s concurrency 1 / přípona GUID |
| Hash | Azure / HTTP | Office Script nebo retention label |

## 3. Rizika a opatření

| Riziko | Dopad | Opatření |
|---|---|---|
| Delegace / limit 2 000 v Power Apps | neúplné KPI bez varování | dotazy po měsících na indexovaný `DueMonthKey`, agregace ve flow; zátěžový test s 50 000 běhy |
| Prahová hodnota 5 000 v SharePointu | selhání dotazů | indexy před nahráním dat; první podmínka vždy indexovaná |
| Výpočet opakování ve flow je složitý | chybné termíny | jediný zdroj pravdy (FLOW-01), převzít testovací případy z `tests/dates-recurrence.test.ts` jako ruční testy; porovnat výstup s demo aplikací pro stejné definice |
| Paginace 5 000 (nízká licence) | flow nenačte vše | filtry na indexované sloupce, zpracování po kontrolách |
| Throttling Outlook / SharePoint (429) | zpožděné e-maily | retry policy, digest, FLOW-07 |
| Smyčky triggerů | nekonečné běhy | `ModifiedSource`, trigger conditions, servisní účet |
| Skrytí UI ≠ zabezpečení | neoprávněné změny přímo v SharePointu | oprávnění dle SHAREPOINT_SCHEMA kap. 7, kritické kroky přes flow |
| Item-level oprávnění | výkon, limit 50 000 | používat výjimečně |
| Časová pásma | posun dne u termínů | jen datum (Date only), `convertTimeZone` ve flow, `PerformedDate` |
| Souběžné úpravy | přepsání dat | `RowVersion` v aplikaci, `If-Match` ve flow |
| Neměnnost protokolů | změna archivních záznamů | oprávnění jen pro servisní účet, verzování, retention label |
| Závislost na jednom tvůrci | údržba | dokumentace vzorců (tento repozitář), pojmenování prvků dle SCREEN_MAP, Solutions |
| Ruční převod logiky | odchylky od prototypu | akceptační testy proti chování demo aplikace (stejná data, stejné výsledky) |

## 4. Doporučené pořadí testování

1. **Datová vrstva:** unikátnost `OccurrenceKey`/`DeduplicationKey` (ruční vložení duplicity musí selhat), ověření sloupců, oprávnění skupin (účty každé role).
2. **FLOW-01:** všechny frekvence a hraniční případy (31. den, přestupný rok, svátky, posun víkendu) – porovnat s náhledem v demo průvodci; idempotence (2× spustit).
3. **Provedení a schválení:** scénáře 11–15, princip čtyř očí, povinné přílohy, souběžnost (scénář 26).
4. **Protokoly:** scénáře 16, 17, 30; řízená oprava.
5. **Změny plánu:** scénáře 3–7 včetně konfliktů s rozpracovanými běhy.
6. **Upozornění:** scénáře 9, 10, eskalace, digest, výpadek (catch-up), retry.
7. **Přehledy:** scénáře 20, 28, 29; delegace s > 5 000 položkami.
8. **Reporting:** scénáře 19, 23.
9. **Role a zabezpečení:** scénář 21 + pokus o přímou úpravu v SharePointu účtem bez oprávnění.
10. **UAT** s klíčovými uživateli, poté pilot na jednom útvaru (1 měsíc souběžně se stávající evidencí).
