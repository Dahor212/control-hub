# BUSINESS_RULES – obchodní pravidla

Pravidla odpovídají implementaci v `src/domain/*` (čistá business logika bez UI) a jsou pokryta testy
v `tests/`. Kde se cílové řešení v Power Platform liší, je to výslovně uvedeno.

## 1. Čas a kalendář

- Časové pásmo **Europe/Prague** pro všechny kalendářní dny. Termíny (`DueDate`, `ScheduledDate`, období) jsou
  **kalendářní dny** bez času. Okamžiky (`SubmittedAt`, `ApprovedAt`…) se ukládají v UTC a na den se převádějí
  přes pražské pásmo (`toPragueDate`) – odeslání 13. 11. ve 22:00 SEČ je stále 13. 11.
- Pracovní den = pondělí–pátek mimo státní svátek ČR. Svátky se dopočítávají včetně Velkého pátku a
  Velikonočního pondělí (algoritmus pro Velikonoce) a lze je doplnit v `IC_Holidays`.
- V demu lze nastavit **testovací datum** (Administrace → Demo režim). Slouží jen k simulaci. V produkci je zdrojem
  vždy čas serveru: `Today()`/`Now()` v Power Apps, `utcNow()` převedené `convertTimeZone(…, 'Central Europe Standard Time')` v Power Automate.

## 2. Entity a jejich identita

| Pojem | Význam |
|---|---|
| Kontrola (`IC_Controls`) | stabilní identita, kód `CTRL-0001` se nikdy nemění ani nepoužije znovu |
| Verze (`IC_ControlVersions`) | metodika, osoby, plán a upozornění platné od data účinnosti; verze jsou neměnné |
| Běh / výskyt (`IC_ControlRuns`) | konkrétní provedení za období; má vlastní GUID a stabilní `OccurrenceKey` |
| Protokol (`IC_Protocols`) | neměnný snapshot obsahu uzavřeného běhu + PDF |

## 3. Pravidla opakování

### 3.1 Podporované frekvence

| `RecurrenceType` | Parametry | Nominální data |
|---|---|---|
| `OneTime` | `startDate` | jen `startDate` |
| `Daily` | interval N | `startDate + k·N` dní (včetně víkendů) |
| `Workday` | – | každý pracovní den od `startDate` |
| `Weekly` | interval N, `daysOfWeek[]` | vybrané dny v týdnech `k·N` od týdne `startDate` (každé N týdnů) |
| `Monthly` | interval N, režim dne | měsíce `startMonth + k·N` |
| `Quarterly` / `SemiAnnual` / `Annual` | režim dne | krok 3 / 6 / 12 měsíců od měsíce `startDate` |

Režim dne v měsíci: `DayOfMonth` (1–31), `LastDayOfMonth`, `NthWorkday` (N-tý pracovní den; pokud jich měsíc tolik
nemá, poslední pracovní den).

**Neexistující den** (31. v kratším měsíci, 29.–31. 2.): `invalidDayPolicy = LastDayOfMonth` → poslední den měsíce
(31. 2. → 28. 2., v přestupném roce 29. 2.), nebo `Skip` → výskyt se v daném měsíci vynechá.

`startDate` je první plánovaný výskyt **a zároveň kotva kadence** (týden pro „každé 2 týdny“, měsíc pro čtvrtletí).
`endDate` (volitelné) ukončí opakování včetně tohoto dne.

### 3.2 Od nominálního data k termínům

1. **Nominální datum** = datum podle pravidla (bez posunu).
2. **Plánované datum** (`ScheduledDate`) = nominální, posunuté podle `nonWorkingDayShift` (`None` / `PreviousWorkday` /
   `NextWorkday`), pokud připadne na víkend či svátek.
3. **Termín splnění** (`DueDate`) = plánované + `DueDateRule.offset`:
   - `Workdays`: přičtou se pracovní dny (víkendy a svátky se přeskočí),
   - `CalendarDays`: přičtou se kalendářní dny a výsledek se případně posune dle `DueDateRule.shift`.
   - Termín nikdy nepředchází plánovanému datu.
4. **Kontrolované období** (`PeriodFrom`–`PeriodTo`) podle `periodMode`:
   - `Current` – cyklus výskytu (den, ISO týden × N, měsíc / čtvrtletí / pololetí / rok),
   - `Previous` – předchozí cyklus (typicky „měsíční kontrola za minulý měsíc“; u `Workday` pondělí kontroluje pá–ne).
5. **Označení běhu** (`RunCode`) podle období: `RUN-2026-10`, `RUN-2026-Q4`, `RUN-2026-H2`, `RUN-2026`,
   `RUN-2026-W46`, u denních a vícedenních týdenních `RUN-20261120`. Slouží jako název složky dokumentů.

### 3.3 Identita výskytu a idempotence

- `OccurrenceKey = <ControlCode>|<nominální datum>`, např. `CTRL-0001|2026-11-20`.
- Sloupec má **vynucenou jedinečnost** – opakované generování (nebo dva souběžné běhy FLOW-01) nemůže vytvořit
  duplicitu. Druhý pokus o vložení skončí chybou duplicity, kterou generátor ignoruje („přeskočeno“).
- Nahrazený výskyt (viz 5.3) dostane klíč s příponou `#S-<8 znaků RunId>`; tím se původní klíč uvolní a případná
  pozdější verze pravidla jej může znovu použít.

### 3.4 Generování (FLOW-01)

- Při založení kontroly: od `startDate` do **dnes + plánovací horizont** (výchozí 12 měsíců, `planningHorizonMonths`).
- Denní běh: pro každou aktivní kontrolu a každou verzi se vygenerují výskyty v průniku `[dnes, horizont]` a
  `[EffectiveFrom, EffectiveTo]` verze; existující klíče se přeskočí. Minulost se zpětně nedoplňuje.
- Archivovaná kontrola se negeneruje.

## 4. Workflow běhu

```
Planned ──Zahájit──▶ InProgress ──Odeslat (schválení vyžadováno)──▶ Submitted ──Schválit──▶ Completed
                         │  ▲                                          │
                         │  └──────────── Returned ◀──Vrátit k doplnění┘
                         └──Dokončit (schválení nevyžadováno)──────────────────────────▶ Completed
Planned / InProgress / Returned ──Zrušit (Koordinátor, důvod)──▶ Cancelled
Completed ──Řízená oprava (Koordinátor/Administrátor, důvod ≥ 10 znaků)──▶ InProgress (IsCorrection)
```

| Akce | Kdo | Podmínky |
|---|---|---|
| Zahájit | přidělený vlastník nebo zástupce | stav Planned (zahájit lze i před plánovaným datem) |
| Uložit rozpracované | vlastník / zástupce | InProgress, Returned |
| Odeslat / Dokončit | vlastník / zástupce | povinné kroky vyplněny; výsledek zvolen; komentář u jiného výsledku než „Bez zjištění“; důvod výjimky u „Nelze vyhodnotit“; komentář u každého kroku „Nedostatek“; „Bez zjištění“ nelze, je-li některý krok „Nedostatek“; u „Se zjištěním“ a „Nesplněno“ alespoň jedno zjištění; všechny **povinné přílohy** nahrány; odesílající nesmí být určeným schvalovatelem |
| Schválit | určený schvalovatel v roli Reviewer | stav Submitted; **schvalovatel ≠ osoba, která kontrolu provedla (`CompletedBy`)** |
| Vrátit k doplnění | určený schvalovatel | povinný komentář; `ReturnCount + 1` |
| Zrušit | Koordinátor, Administrátor | povinný důvod; dokončené nelze zrušit |
| Jednorázová úprava | Koordinátor, Administrátor | stav Planned/InProgress/Returned; povinný důvod |
| Řízená oprava | Koordinátor, Administrátor | jen Completed; povinný důvod |

Výsledky: `NoFindings` Bez zjištění, `WithFindings` Se zjištěním, `PartiallyMet` Částečně splněno, `NotMet` Nesplněno,
`NotAssessable` Nelze vyhodnotit.

Časové značky: `StartedAt` při zahájení; `SubmittedAt` při **každém** odeslání (poslední odeslání rozhoduje o
včasnosti); `CompletedBy` = provádějící; u kontrol bez schválení `CompletedAt = SubmittedAt`; u schvalovaných
`CompletedAt = ApprovedAt`. Při řízené opravě se `SubmittedAt` nemění (oprava nezhorší ani nezlepší včasnost).

## 5. Změny plánu a verzování

### 5.1 Upravit pouze tento výskyt (jednorázová úprava)

- Mění jen vybraný běh: plánované datum, termín, odpovědnou osobu, zástupce, schvalovatele, poznámku.
- Nastaví `IsOneTimeOverride = true`; definice ani ostatní výskyty se nemění.
- Validace: termín ≥ plánované datum, max. 180 dní; u schvalování schvalovatel ≠ odpovědná osoba; **důvod povinný**.
- Audit: záznam pro každé změněné pole s důvodem. Upozornění: nové odpovědné osobě (přidělení) nebo stávající
  osobě (změna termínu) – FLOW-06.

### 5.2 Upravit tento a všechny následující (nová verze)

Vznikne nová verze s datem účinnosti (`EffectiveFrom`, výchozí = nominální datum vybraného výskytu nebo dnes,
nejdříve však účinnost poslední verze). Předchozí verze dostane `EffectiveTo = EffectiveFrom − 1 den`.
Povinný důvod. Před uložením se zobrazí **náhled dopadu** a uživatel musí potvrdit „Rozumím dopadu změny“.

Dotčené výskyty = nenahrazené běhy s nominálním datem ≥ účinnost:

| Stav výskytu | Akce | Popis |
|---|---|---|
| Completed, Cancelled | **beze změny** | historie i protokoly zůstávají na původní verzi |
| InProgress, Submitted, Returned | **konflikt – beze změny** | zůstává na původní verzi, zobrazí se varování |
| Planned + jednorázová úprava, výskyt existuje i v novém pravidle | **úprava zachována** | převede se na novou verzi (metodika), termín a osoby z úpravy zůstávají |
| Planned + jednorázová úprava, výskyt v novém pravidle neexistuje | **konflikt** | ponechán, koordinátor rozhodne ručně |
| Planned, stejný `OccurrenceKey` existuje i v novém pravidle | **aktualizace na místě** | nové termíny, osoby, verze; `RunId` a `RunCode` (složka) zůstávají |
| Planned, výskyt v novém pravidle neexistuje | **nahrazení** | `Cancelled`, `IsSuperseded = true`, uvolněný klíč, důvod „Nahrazeno verzí vN“ |
| nový výskyt dle pravidla bez odpovídajícího běhu | **nový výskyt** | vytvoří se – **kromě** případu, kdy totéž kontrolované období už pokrývá ponechaný běh (dokončený, rozpracovaný, upravený) → „Období již pokryto“, aby nevznikla dvojí kontrola téhož období |

Není dovoleno tiše přepsat dokončené ani schvalované kontroly. Před zápisem se ověří `RowVersion` všech dotčených
výskytů i kontroly; pokud se mezitím cokoli změnilo, uložení se odmítne a náhled se musí otevřít znovu.

### 5.3 Archivace a reaktivace

- Archivace (povinný důvod): `IsActive = false`; naplánované běhy s termínem ≥ dnes se zruší jako nahrazené
  (uvolní klíče); rozpracované a prošlé zůstávají otevřené a zobrazí se upozornění. Nic se nemaže.
- Reaktivace (povinný důvod): `IsActive = true` a FLOW-01 vygeneruje výskyty od dneška podle poslední verze.

## 6. Odvozené (dopočítávané) stavy

Ukládá se pouze `WorkflowState`. Časový stav se počítá vždy z termínu, časových značek a dneška:

| Časový stav | Podmínka |
|---|---|
| Zrušeno | `WorkflowState = Cancelled` |
| Dokončeno včas | Completed a datum provedení ≤ `DueDate` |
| Dokončeno pozdě | Completed a datum provedení > `DueDate` (prodlení = rozdíl kalendářních dnů) |
| Čeká na schválení | Submitted (příznak „odesláno po termínu“, je-li odeslání > termín) |
| Po termínu | Planned/InProgress/Returned a dnes > `DueDate` |
| Termín dnes | Planned/InProgress/Returned a dnes = `DueDate` |
| Blíží se termín | do termínu zbývá ≤ `dueSoonDays` (výchozí 3) |
| Naplánováno | Planned a plánované datum > dnes |
| K provedení | ostatní otevřené |

Datum provedení = pražský den posledního `SubmittedAt` (jinak `CompletedAt`).

## 7. Upozornění a eskalace

| Typ | Spouštěč | Příjemce | Deduplikační klíč |
|---|---|---|---|
| Nově přidělená kontrola | založení kontroly, nová verze se změnou osoby, jednorázová změna osoby | nová odpovědná osoba (a zástupce při založení) | `ControlId|Assignment|verze|e-mail` / `RunId|Assignment|e-mail|čas` |
| Změna termínu | jednorázová změna termínu | odpovědná osoba | `RunId|AssignmentChange|nový termín|čas` |
| Blížící se termín | denní kontrola | odpovědná osoba | `RunId|DueReminder|práh|e-mail` |
| Po termínu | denní kontrola | odpovědná osoba | `RunId|Overdue|práh|e-mail` |
| Eskalace | denní kontrola, prodlení ≥ eskalační práh | vedoucí útvaru (`IC_Lookups.ManagerEmail`) a/nebo koordinátor | `RunId|Escalation|e-mail` |
| Žádost o schválení | odeslání ke schválení | schvalovatel | `RunId|ApprovalRequest|č. odeslání|e-mail` |
| Čekající schválení | denní kontrola, čeká ≥ `approvalReminderDays` | schvalovatel | `RunId|ApprovalPending|ReturnCount|e-mail` |
| Vráceno k doplnění / Schváleno | událost | provádějící | `RunId|Returned|n` / `RunId|Approved|…` |
| Denní souhrn | režim `DailyDigest` | každý příjemce 1× denně | `e-mail|DailyDigest|den|n` |
| Chyba automatizace | vyčerpání pokusů o doručení | administrátor | `NotificationId|AutomationFailure` |

Pravidla:
- **Globální** prahy v `IC_Settings` (výchozí: 7, 3, 1, 0 dní před; 1., 3., 7. den po; eskalace po 5 dnech);
  **individuální** prahy ve verzi kontroly (`ReminderPolicy.useGlobal = false`) mají přednost.
- **Bez duplicit:** před vytvořením se ověří existence deduplikačního klíče (a klíč má v SharePointu vynucenou jedinečnost).
- **Dohánění:** neproběhla-li kontrola několik dní, nepošle se lavina. Před termínem jen nejbližší aplikovatelná
  připomínka (nejmenší práh ≥ dnům do termínu), po termínu jen nejvyšší dosažený práh.
- **Po dokončení / zrušení** se běh nevyhodnocuje (jen `IsOpen`) a nevyřízená upozornění k němu se zruší.
- Upozornění na běhy archivovaných kontrol se negenerují.
- **Doručení:** simulované `Sent`/`Failed`; neúspěšná lze opakovat (max. `maxRetries`, výchozí 3), poté upozornění administrátora.
- **Denní souhrn:** jednotlivé položky se uloží se stavem `Digested` a příjemce dostane jedinou zprávu.
- Událostní upozornění (přidělení, schvalování) se posílají ihned, i v režimu souhrnu.

## 8. Ukazatele (KPI)

Populace období **P** = nenahrazené, **nezrušené** běhy s `DueDate` v období (tj. „plánované v období“).

| Ukazatel | Definice |
|---|---|
| Naplánováno v období | \|P\| |
| Zrušeno | nenahrazené zrušené běhy s termínem v období – vykazuje se zvlášť, **nezapočítává se** do plánu ani míry |
| Dokončeno (z plánu) | běhy z P ve stavu Completed |
| Dokončeno v období | běhy, jejichž `CompletedAt` (pražský den) spadá do období – **bez ohledu na termín** (jiná populace!) |
| Dokončeno včas / pozdě | Completed z P s datem provedení ≤ / > termín |
| Po termínu | běhy z P ve stavu Planned/InProgress/Returned s termínem < dnes |
| Nedokončeno | \|P\| − dokončeno (včetně čekajících na schválení) |
| Vyhodnotitelné | běhy z P s uplynulým termínem nebo dokončené |
| **Míra včasného plnění** | dokončeno včas / vyhodnotitelné (běhy s termínem v budoucnu míru nezkreslují) |
| Podíl dokončených | dokončeno / naplánováno |
| Průměrné prodlení | průměr dnů prodlení u běhů z P dokončených pozdě |
| Průměrné stáří prodlení | průměr dnů po termínu u otevřených běhů po termínu |
| Opakovaně opožděné kontroly | počet kontrol s ≥ 2 běhy v P, které jsou dokončené pozdě nebo po termínu |
| Vrácené ke schválení | běhy z P s `ReturnCount > 0` |
| Blížící se termín (provozní) | otevřené běhy s termínem dnes … dnes + 7 – nezávislé na období |
| Čeká na schválení (provozní) | běhy ve stavu Submitted – nezávislé na období |
| Otevřená nápravná opatření | zjištění se stavem ≠ Closed; „po termínu“, je-li termín nápravy < dnes |

Trend = stejné ukazatele po měsících podle měsíce termínu. Skóre problémové kontroly = (pozdě + 2 × po termínu +
vrácení) × váha rizika (Nízká 1, Střední 2, Vysoká 3, Kritická 4).

Proklik z karty do seznamu (`/runs?view=…`) používá stejnou funkci výběru (`src/ui/drilldown.ts`) jako výpočet KPI,
takže počty sedí.

## 9. Protokoly

- Vznik: automaticky při přechodu do Completed (u schvalovaných po schválení) – FLOW-04.
- Obsah se uloží jako **neměnný snapshot** (JSON) do `IC_Protocols` spolu s SHA-256 otiskem kanonického JSON; PDF se
  vykresluje **jen ze snapshotu**. Změna metodiky, osob nebo názvu kontroly proto historické protokoly nemění.
- Protokol obsahuje: logo a název aplikace, číslo a název kontroly, kontrolované období, metodiku a účel, odpovědnou
  osobu, provádějícího, data zahájení/provedení/dokončení, kroky a jejich výsledky, celkový výsledek, komentáře,
  seznam příloh, zjištění a opatření, schvalovatele a datum schválení, unikátní ID `PRT-<kontrola>-<běh>-V<n>`.
- **Řízená oprava:** Koordinátor/Administrátor s důvodem otevře běh (InProgress, `IsCorrection`); původní protokol
  zůstává platný až do vzniku nového; po opětovném uzavření vznikne verze `V<n+1>` s důvodem opravy a původní
  dostane stav `Superseded`. Vše se zapisuje do auditu.

## 10. Měsíční report

- Jen za **uzavřený** měsíc. Stav běhů se zmrazí k datu vytvoření (rekonstrukce z časových značek workflow).
- Obsahuje: útvar(y), období, plánované, dokončené, včas, opožděně, nedokončené, míru včasnosti, významná zjištění
  (vysoká/kritická založená v měsíci), otevřená nápravná opatření, problémové kontroly, trend 6 měsíců, definice.
- Uloží se jako snapshot do `IC_ReportSnapshots` + PDF do `IC_ManagementReports`; opakované vygenerování vytvoří
  **novou verzi**, předchozí se nemění.

## 11. Audit

Zapisuje se (append-only): založení/archivace/reaktivace kontroly, každá verze a změněná pole, přeplánování
budoucích výskytů (souhrn dopadu), jednorázové úpravy (po polích), přechody workflow, uložení rozpracovaného,
nahrání/odebrání příloh, zjištění a jejich změny, protokoly (hash), reporty (hash), nastavení, role, číselníky,
export/import dat, testovací datum. Důvod je povinný u změn odpovědnosti, termínu, pravidel opakování, archivace,
zrušení, opravy a odebrání přílohy.

## 12. Role (přehled)

| Schopnost | Admin | Koordinátor | Vlastník | Schvalovatel | Manažer | Auditor |
|---|---|---|---|---|---|---|
| Registr (čtení) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Zakládat / měnit / archivovat kontroly | ✔ | ✔ | | | | |
| Přeplánovat, rušit běhy, řízená oprava | ✔ | ✔ | | | | |
| Provádět kontrolu | (jen je-li přidělen) | (jen je-li přidělen) | ✔ přidělené | ✔ přidělené | ✔ přidělené | |
| Schvalovat | | | | ✔ (určený, ne vlastní) | | |
| Manažerský přehled, reporty | ✔ | ✔ | | | ✔ (rozsah útvaru) | ✔ (čtení) |
| Generovat report | ✔ | ✔ | | | ✔ | |
| Administrace | ✔ | (audit, technický stav) | | | | (audit, technický stav – čtení) |
| Simulace automatizací | ✔ | ✔ | | | | |

Rozsah: Vlastník vidí běhy, kde je odpovědnou osobou nebo zástupcem; Schvalovatel navíc běhy, kde je schvalovatelem;
Manažer běhy svého útvaru (`DepartmentScope`) nebo všech útvarů; ostatní vše.
