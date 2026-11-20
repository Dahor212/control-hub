# POWER_AUTOMATE_FLOWS – specifikace automatizací

> **Upozornění:** v referenční webové aplikaci jsou automatizace pouze **simulované** (funkce v `src/services/*`,
> záznamy v `IC_AutomationLog`, žádné e-maily). Tento dokument popisuje skutečné produkční flow v Power Automate.

## 0. Společné zásady

| Téma | Zásada |
|---|---|
| Konektory | Jen standardní: **SharePoint**, **Office 365 Outlook**, **Office 365 Users**, **OneDrive for Business** (převod na PDF), **Power Apps (V2) trigger**, **Notifications**, **Approvals** (nepovinně). Žádný HTTP, Dataverse, Azure ani vlastní konektor. |
| Licence | Microsoft 365 (Power Automate for Office 365). Limit paginace „Get items“ v nízkém plánu **5 000 položek** → dotazy navrhujte tak, aby vracely méně (filtr na indexované sloupce, po měsících / po kontrolách). Denní limit akcí na uživatele (Power Platform request limits) – pro velké objemy použijte servisní účet s licencí. |
| Vlastník a připojení | Flow vlastní **servisní účet** (např. `svc-controlhub@…`) + sdílená skupina vlastníků. Připojení SharePoint/Outlook pod servisním účtem. Odesílání ze **sdílené schránky** (`Send an email from a shared mailbox (V2)`) vyžaduje oprávnění *Send As* udělené správcem Exchange. |
| Řešení (Solution) | Doporučeno vytvořit flow v Solution (child flow, environment variables pro URL webu a e-maily). Pokud prostředí řešení nepovoluje, použijte běžné flow a URL webu v každé akci. |
| Časové pásmo | Plánované triggery v pásmu **(UTC+01:00) Belgrade, Bratislava, Budapest, Ljubljana, Prague**. Dnešní den: `convertTimeZone(utcNow(), 'UTC', 'Central Europe Standard Time', 'yyyy-MM-dd')` → proměnná `varToday`. Datum v OData filtru jako `'yyyy-MM-dd'`. |
| Chybové větve | Každý flow: **Scope „Try“** → **Scope „Catch“** (*Configure run after: has failed, has timed out*) → zápis do `IC_AutomationLog` (Status `Failed`, `Message` = `result('Try')`) → **Run a child flow** FLOW-07 nebo e-mail administrátorovi → **Terminate (Failed)**. **Scope „Finally“** zapíše úspěšný souhrn. |
| Retry | Akce Outlook/SharePoint: *Settings → Retry policy* Exponential, 4 pokusy, min. interval PT10S. Chyba 429 (throttling) se tím obvykle vyřeší. |
| Idempotence | Unikátní klíče: `OccurrenceKey` (běhy), `DeduplicationKey` (upozornění), `ReportId`, `ProtocolId`. Pokus o duplicitní vložení skončí chybou „duplicate value“ → akce „Create item“ má *Configure run after: is successful, has failed* a následná podmínka chybu duplicity započítá jako „přeskočeno“. |
| Smyčky | Flow, které zapisuje do položky, na kterou má trigger, nastaví `ModifiedSource = 'Flow'`. Trigger conditions: `@not(equals(triggerOutputs()?['body/ModifiedSource'], 'Flow'))`. Doplňkově `@not(equals(triggerOutputs()?['body/Editor/Email'], 'svc-controlhub@…'))`. |
| Souběh | Triggery na položku: *Settings → Concurrency control* zapnout, Degree 1 pro FLOW-04 (protokol) a FLOW-06. Apply to each s zápisem čísel (kódy) sekvenčně; čtecí smyčky paralelně (≤ 20). |
| Audit | Každý zápis do business dat doplní záznam do `IC_AuditLog` (`ChangedBy` = `svc-controlhub@…`, `Action` = popis, `ChangeReason` = „FLOW-0x“). |
| Bezpečnost | Flow nezpřístupňují data mimo tenant. Žádné odkazy „Anyone“. Vstupy z Power Apps V2 se validují (existence `ControlId`, role volajícího přes `IC_RoleAssignments` a `triggerBody()?['headers']?['x-ms-user-email']` / Power Apps parametr s `User().Email`). |
| Log | Na konci každého běhu (i v Catch) záznam do `IC_AutomationLog`: `FlowName`, `StartedAt` (`workflow()?['run']?['properties']?['startTime']` nebo proměnná), `FinishedAt`, `Status`, `ItemsProcessed/Created/Skipped`, `ErrorCount`, `Message`, `RunUrl` = `concat('https://make.powerautomate.com/environments/', workflow()?['tags']?['environmentName'], '/flows/', workflow()?['name'], '/runs/', workflow()?['run']?['name'])`. |

Přehled:

| Flow | Trigger | Hlavní konektory | Odpovídá React funkci |
|---|---|---|---|
| FLOW-01 GenerateRecurringControls | Recurrence denně 02:00 + Power Apps (V2) | SharePoint | `planGeneration`, `planVersionChange` (`src/domain/versioning.ts`) |
| FLOW-02 SendDueDateReminders | Recurrence denně 06:00 | SharePoint, Outlook | `evaluateDeadlineNotifications` (připomínky) |
| FLOW-03 EscalateOverdueControls | Recurrence denně 06:15 | SharePoint, Outlook | `evaluateDeadlineNotifications` (po termínu, eskalace) |
| FLOW-04 OnControlCompleted | SharePoint – When an item is created or modified (IC_ControlRuns) | SharePoint, OneDrive for Business | `createProtocolForRun` |
| FLOW-05 GenerateMonthlyManagementReport | Recurrence denně 07:00 + podmínka „1. pracovní den“ | SharePoint, OneDrive, Outlook | `buildMonthlyReport` |
| FLOW-06 AssignmentChangeNotification | SharePoint – When an item is created or modified (IC_ControlRuns, IC_Controls) | SharePoint, Outlook | `notifyEvent` |
| FLOW-07 MonitorAutomationFailures | Child flow + Recurrence každou hodinu | SharePoint, Outlook | `retryFailedNotifications` |

---

## FLOW-01 GenerateRecurringControls

**Účel:** idempotentně vytvořit výskyty (běhy) aktivních kontrol na plánovací horizont; na požádání z aplikace
spočítat náhled dopadu nové verze („Preview“) nebo ji uplatnit („ApplyVersion“).

**Trigger:** (a) *Recurrence* 1× denně 02:00 (Prague); (b) *Power Apps (V2)* s vstupy `ControlId` (Text),
`Mode` (Text: `Apply` | `Preview` | `ApplyVersion`), `DraftJson` (Text, nepovinné), `EffectiveFrom` (Text), `Reason` (Text), `CallerEmail` (Text).

**Vstupy / zdroje:** `IC_Controls` (`IsActive eq 1`), `IC_ControlVersions` (`ControlId eq '<id>'`), `IC_ControlRuns`
(`ControlId eq '<id>'`, Select `OccurrenceKey,RunCode,RunId,WorkflowState,NominalDate,IsSuperseded,RowVersion,PeriodFrom,PeriodTo,IsOneTimeOverride`),
`IC_Holidays`, `IC_Settings` (`planningHorizonMonths`).

**Proměnné:** `varToday` (String), `varHorizon` = `formatDateTime(addToTime(varToday, int(horizonMonths), 'Month'), 'yyyy-MM-dd')`,
`varCreated` (Integer), `varSkipped` (Integer), `varErrors` (Integer), `arrHolidays` (Array dat svátků),
`arrNominal` (Array), `varCursor` (String).

**Pořadí akcí (režim Apply / plánovaný běh):**
1. Initialize variables; `Get items` IC_Settings → `varHorizon`; `Get items` IC_Holidays (Filter `HolidayDate ge '<rok-1>-01-01'`) → `Select` jen datum → `arrHolidays`.
2. `Get items` IC_Controls – Filter Query `IsActive eq 1` (a při Power Apps triggeru navíc `and ControlId eq '<id>'`).
3. **Apply to each kontrola** (concurrency 5):
   1. `Get items` IC_ControlVersions – `ControlId eq '@{items('Each')?['ControlId']}'`, Order by `VersionNumber`.
   2. `Get items` IC_ControlRuns – `ControlId eq '…'`, Select `OccurrenceKey` → `Select` → pole `arrExistingKeys`.
   3. **Apply to each verze** (sekvenčně): spočti `from = max(varToday, EffectiveFrom, RecurrenceSettings.startDate)`,
      `to = min(varHorizon, EffectiveTo, endDate)`; `Parse JSON` RecurrenceSettings a DueDateRule.
   4. **Výpočet nominálních dat** (Do until `varCursor > to`, limit 500 iterací) podle typu:
      - `Daily`: `varCursor = addDays(varCursor, interval)`.
      - `Workday`: posun o 1 den, podmínka `dayOfWeek(varCursor)` ∉ {0,6} a `contains(arrHolidays, varCursor)` = false.
      - `Weekly`: iteruj pondělí týdnů (`addDays(startDate, mul(7, k))`), týden zahrnout, pokud `mod(div(dateDifference_days, 7), interval) = 0`; pro každý den z `daysOfWeek` `addDays(monday, sub(dow,1))`. (Počet dní mezi daty: `div(sub(ticks(b), ticks(a)), 864000000000)`.)
      - `Monthly/Quarterly/SemiAnnual/Annual`: krok měsíců `step` (1/3/6/12 × interval); měsíc `addToTime(startOfMonth(startDate), mul(k, step), 'Month')`;
        den: `DayOfMonth` → `min(dayOfMonth, int(formatDateTime(addDays(startOfMonth(addToTime(m,1,'Month')), -1), 'dd')))` (politika `LastDayOfMonth`) nebo přeskočit (politika `Skip`, když `dayOfMonth` > počet dní);
        `LastDayOfMonth` → poslední den; `NthWorkday` → vnořený Do until počítající pracovní dny.
      - Každé nominální datum v `[from, to]` přidej do `arrNominal`.
   5. **Apply to each nominální datum** (sekvenčně):
      - `key = concat(ControlCode, '|', nominal)`; pokud `contains(arrExistingKeys, key)` → `varSkipped + 1` a pokračuj.
      - Plánované datum: posun dle `nonWorkingDayShift` (Do until pracovní den, ±1 den).
      - Termín: `Workdays` → Do until počítající pracovní dny; `CalendarDays` → `addDays` + posun.
      - Období a `RunCode` dle BUSINESS_RULES 3.2 (výrazy `formatDateTime(..., 'yyyy-MM')`, čtvrtletí `add(div(sub(int(formatDateTime(d,'MM')),1),3),1)`).
      - `Create item` IC_ControlRuns: `RunId = guid()`, `OccurrenceKey = key`, `RunCode`, `NominalDate`, `ScheduledDate`, `DueDate`, `DueMonthKey = substring(DueDate,0,7)`, `PeriodFrom/To`, osoby z verze, `WorkflowState = 'Planned'`, `IsOpen = true`, `ChecklistResults` = `string(select(ChecklistDefinition → {itemId,label,required,answer:null,comment:''}))`, `RowVersion = 1`, `ModifiedSource = 'Flow'`.
      - *Configure run after* „has failed“: pokud chyba obsahuje `duplicate` (unikátní `OccurrenceKey`) → `varSkipped + 1`, jinak `varErrors + 1`.
4. **Finally:** `Create item` IC_AutomationLog (`ItemsCreated = varCreated`, `ItemsSkipped = varSkipped`, `ErrorCount = varErrors`); při Power Apps triggeru `Respond to a PowerApp or flow` (`status`, `created`, `skipped`, `message`).

**Režim Preview / ApplyVersion:** stejný výpočet výskytů pro koncept nové verze (`DraftJson`) od `EffectiveFrom`;
porovnání s existujícími běhy podle tabulky v BUSINESS_RULES 5.2 → pole akcí `update/create/cancel/keepConflict/keepOverride/skipCovered/unchanged`.
Preview vrátí JSON (`impactjson`) bez zápisu. ApplyVersion (concurrency řízení flow = 1):
`Create item` IC_ControlVersions (nová verze), `Update item` předchozí verze (`EffectiveTo`), `Update item` IC_Controls
(denormalizace, `RowVersion + 1`), pro každý dotčený běh *Send an HTTP request to SharePoint* `PATCH` s `If-Match: <etag>`
(při 412 → chyba „mezitím změněno“, zbytek se nezapisuje a vrátí se chyba aplikaci), `Create item` nových běhů,
audit (souhrn dopadu + změněná pole verze), FLOW-06 se spustí sám (změna osob).

**Výstupy:** nové položky IC_ControlRuns, log, odpověď aplikaci.
**Chybové větve:** Catch → log `Failed` + FLOW-07. Částečně vytvořené běhy nevadí – opakované spuštění je idempotentní.
**Idempotence:** unikátní `OccurrenceKey`; minulost se nedoplňuje.
**Časové pásmo:** všechna data jako řetězce `yyyy-MM-dd` (bez času) – žádné převody UTC u kalendářních dnů.
**Bezpečnost:** ruční spuštění jen pro role Coordinator/Administrator (ověřit `CallerEmail` v IC_RoleAssignments).
**Postup vytvoření:** Make → Create → Scheduled cloud flow → „FLOW-01 GenerateRecurringControls“ → Recurrence (Day, 1, 02:00, Prague) → akce dle výše; druhou instanci (nebo child flow) s triggerem Power Apps (V2) pro ruční režimy.

---

## FLOW-02 SendDueDateReminders

**Trigger:** Recurrence denně 06:00 (Prague), jen pracovní dny (podmínka `dayOfWeek(varToday)` ∉ {0,6} a není svátek) – volitelně i víkendy.
**Zdroje:** IC_ControlRuns, IC_ControlVersions (ReminderPolicy), IC_Settings, IC_Notifications.
**OData filtr:** `IsOpen eq 1 and IsSuperseded eq 0 and DueDate ge '@{varToday}' and DueDate le '@{addDays(varToday, 7)}'`
(max. práh připomínky 7 dní – načte jen relevantní běhy; indexy `IsOpen`, `DueDate`).
**Proměnné:** `varToday`, `arrDaysBefore` (z IC_Settings), `varCreated`, `varDup`, `varFailed`.

**Akce:**
1. Načti globální nastavení (`reminderDaysBefore`, `digestMode`).
2. Apply to each běh (concurrency 1 kvůli deduplikaci, nebo 10 + spoléhat na unikátní klíč):
   - Přeskoč stav `Submitted` (řeší se schvalovací připomínkou).
   - Politika: pokud verze `ReminderPolicy.useGlobal = false` → její `daysBefore`.
   - `daysToDue = div(sub(ticks(DueDate), ticks(varToday)), 864000000000)`.
   - **Nejbližší práh:** `first(sort(filter(arrDaysBefore, x ≥ daysToDue)))` (Filter array + `min`). Žádný → pokračuj.
   - `key = concat(RunId,'|DueReminder|',práh,'|',AssignedOwnerEmail)`.
   - `Get items` IC_Notifications `DeduplicationKey eq '<key>'` (Top 1) → existuje → `varDup + 1`, pokračuj.
   - `Create item` IC_Notifications (`DeliveryStatus = 'Pending'`, `Reason` = text pravidla) – při chybě duplicity přeskoč.
   - Režim **Immediate**: `Send an email from a shared mailbox (V2)` (předmět/tělo jako v aplikaci, odkaz do Power Apps
     `https://apps.powerapps.com/play/<appId>?runId=<RunId>`) → `Update item` notifikace `Sent`/`SentAt`; při chybě
     (run after failed) → `Failed`, `ErrorMessage`, `RetryCount`.
   - Režim **DailyDigest**: notifikace se stavem `Digested`, e-mail se neposílá.
3. Digest: `Get items` notifikací dneška se stavem `Digested` → seskupit podle příjemce (Select + union příjemců) →
   1 e-mail na příjemce (HTML tabulka – „Create HTML table“) → záznam `DailyDigest`, klíč `e-mail|DailyDigest|den|1`.
4. Log.

**Idempotence:** deduplikační klíč s vynucenou jedinečností; opakované spuštění téhož dne neposílá nic znovu.
**Catch-up:** volbou „nejbližšího prahu“ se po výpadku nepošle lavina starších připomínek.
**Zastavení po dokončení:** filtr `IsOpen eq 1` – dokončené/zrušené běhy se nevyhodnocují.
**Licence:** standard. **Bezpečnost:** e-maily jen interním adresátům; neuvádět citlivé údaje, jen kód a název kontroly.

---

## FLOW-03 EscalateOverdueControls

**Trigger:** Recurrence denně 06:15.
**Filtr:** `IsOpen eq 1 and IsSuperseded eq 0 and DueDate lt '@{varToday}' and WorkflowState ne 'Submitted'`.
**Akce pro každý běh:**
1. `daysOverdue = div(sub(ticks(varToday), ticks(DueDate)), 864000000000)`.
2. **Upozornění po termínu:** nejvyšší dosažený práh z `overdueDaysAfter` (výchozí 1, 3, 7) → klíč `RunId|Overdue|práh|owner` → jako FLOW-02.
3. **Eskalace:** pokud `daysOverdue ≥ escalationAfterDays` (verze nebo globální):
   příjemci = vedoucí útvaru (`IC_Lookups` `LookupType eq 'Department' and Code eq '<Department>'` → `ManagerEmail`)
   a/nebo koordinátor (`IC_Settings.coordinatorEmail`) – bez odpovědné osoby; klíč `RunId|Escalation|příjemce` (jednou na běh a příjemce).
4. Schvalovací připomínky: druhý dotaz `WorkflowState eq 'Submitted'` → pokud čeká ≥ `approvalReminderDays` → klíč `RunId|ApprovalPending|ReturnCount|reviewer`.
5. Log. Volitelně souhrnný e-mail koordinátorovi se seznamem eskalací.

---

## FLOW-04 OnControlCompleted

**Účel:** po dokončení nebo finálním schválení vytvořit neměnný snapshot, PDF protokol, uložit jej a propojit s během.
**Trigger:** SharePoint *When an item is created or modified* – `IC_ControlRuns`. **Trigger conditions** (všechny):
- `@equals(triggerOutputs()?['body/WorkflowState'], 'Completed')`
- `@or(empty(triggerOutputs()?['body/ProtocolId']), equals(triggerOutputs()?['body/IsCorrection'], true))`
- `@not(equals(triggerOutputs()?['body/ModifiedSource'], 'Flow'))`
**Concurrency:** 1.

**Akce:**
1. `Get item` (čerstvá data podle ID) – ověř stav `Completed` (jinak Terminate *Cancelled*).
2. **Kontrola povinných údajů:** `Result` vyplněn; u `ApprovalRequired` `ApprovedBy` ≠ `CompletedBy` (4 oči);
   povinné přílohy: `Get files (properties only)` z `IC_ControlDocuments` (`RunId eq '<id>' and IsRemoved eq 0 and DocumentType eq 'Evidence'`)
   vs. `RequiredEvidence` z verze. Při porušení → audit „Protokol nevytvořen – porušení pravidel“ + FLOW-07 + Terminate.
3. Načti verzi (`VersionId`), kontrolu, zjištění běhu, existující protokoly běhu (pro číslo verze).
4. **Snapshot:** akce *Compose* s JSON objektem (stejná struktura jako `ProtocolSnapshot` v `src/domain/types.ts`) –
   jména osob z `Office 365 Users – Get user profile (V2)`.
5. `Create item` IC_Protocols (`ProtocolId = concat('PRT-', ControlCode, '-', RunCode, '-V', verze)`, `SnapshotData = string(outputs('Snapshot'))`, `Status = 'Valid'`).
   Předchozí platný protokol → `Status = 'Superseded'`, `SupersededBy`.
6. **PDF (bez premium):**
   1. *Compose* HTML protokolu (šablona s CSS, `<meta charset="utf-8">`, logo jako inline SVG/PNG base64, tabulky kroků, příloh, zjištění).
   2. OneDrive for Business *Create file* `/ControlHubTemp/<ProtocolId>.html` (servisní účet).
   3. OneDrive for Business *Convert file* (Target type PDF) – standardní akce, převod HTML → PDF.
   4. SharePoint *Create new folder* `IC_ControlDocuments/<ControlCode>/<RunCode>/Protocols` (pokud neexistuje) a *Create file* `<ProtocolId>.pdf` s obsahem z převodu.
   5. *Update file properties*: `DocumentId = guid()`, `RunId`, `ControlId`, `DocumentType = 'Protocol'`, `ProtocolId`.
   6. OneDrive *Delete file* (dočasné HTML).
7. `Update item` IC_ControlRuns: `ProtocolId`, `ProtocolUrl` (odkaz na soubor), `IsCorrection = false`, `ModifiedSource = 'Flow'`, `RowVersion + 1`.
8. `Create item` IC_AuditLog („Vytvoření protokolu“ / „Vytvoření opravené verze protokolu“).
9. Log; při chybě Catch → snapshot zůstává, běh dostane `ProtocolUrl` prázdné a FLOW-07 upozorní administrátora (opakování ručně spuštěním flow pro běh).

**Integrita (hash):** výrazy Power Automate nemají SHA-256. Varianty bez premium: (a) uložit snapshot i PDF do
knihovny s verzováním a **štítkem uchovávání „Záznam“** (Microsoft Purview – vyžaduje správce compliance), což
technicky brání úpravám; (b) spočítat SHA-256 v **Office Script** (Excel Online (Business) → *Run script*, kód
v čistém TypeScriptu) – ověřte dostupnost Office Scripts v tenantu. React prototyp počítá SHA-256 v prohlížeči.

**Alternativy PDF a licence:**

| Varianta | Konektor | Licence | Poznámka |
|---|---|---|---|
| HTML → OneDrive „Convert file“ → PDF | OneDrive for Business | **standard** | doporučeno; omezené CSS (bez flex/grid), tabulky OK, čeština OK s UTF-8 |
| Word šablona → „Populate a Microsoft Word template“ → Convert → PDF | Word Online (Business) | **premium** | nejlepší vzhled; vyžaduje Power Automate Premium |
| Power Apps funkce `PDF()` + Power Automate uložení | – | standard | ve starších verzích experimentální; tiskne obrazovku/kontejner, problematické vícestránkové protokoly – ověřte v tenantu |
| Encodian / Adobe / Muhimbi | třetí strany | premium + externí služba | v bankovním prostředí zpravidla nepřípustné (data mimo tenant) |
| Ruční tisk z prohlížeče | – | – | jen nouzově, neauditovatelné |

---

## FLOW-05 GenerateMonthlyManagementReport

**Trigger:** Recurrence denně 07:00; **podmínka „první pracovní den měsíce“**: `varToday` není víkend ani svátek a
všechny dny od `startOfMonth(varToday)` do `addDays(varToday,-1)` jsou nepracovní (Do until), a v `IC_ReportSnapshots`
ještě není report za předchozí měsíc (`ReportingYear eq Y and ReportingMonth eq M and DepartmentScope eq 'ALL'`).
Druhý trigger *Power Apps (V2)* pro ruční vygenerování (Year, Month, Scope) → vytvoří další verzi.

**Akce:**
1. `mk = formatDateTime(addToTime(startOfMonth(varToday), -1, 'Month'), 'yyyy-MM')`.
2. `Get items` IC_ControlRuns – `DueMonthKey eq '<mk>' and IsSuperseded eq 0` (paginace zapnuta, limit 5 000).
3. Pro trend 6 měsíců stejný dotaz pro předchozích 5 měsíců (nebo převzít hodnoty z předchozích reportů).
4. Výpočet metrik akcemi *Filter array* + `length()` (definice v BUSINESS_RULES kap. 8), po útvarech (Apply to each nad IC_Lookups Department).
   Datum provedení = `PerformedDate` (doporučený sloupec) nebo `convertTimeZone(SubmittedAt,'UTC','Central Europe Standard Time','yyyy-MM-dd')`.
5. Zjištění: `Get items` IC_Findings – `Severity eq 'High' or Severity eq 'Critical'` a `CreatedAt` v měsíci; otevřená: `Status ne 'Closed'`.
6. Snapshot JSON (*Compose*, struktura `MonthlyReportData`) → `Create item` IC_ReportSnapshots (`ReportId = RPT-<mk>-ALL-V<n>`).
7. HTML → PDF (jako FLOW-04) → `IC_ManagementReports/<rok>/<mk>/<ReportId>.pdf` → `Update item` (`ReportFileUrl`).
8. E-mail vedoucím útvarů a ředitelce s odkazem (ne přílohou).
9. Audit + log.
**Neměnnost:** snapshot se po vytvoření nikdy neaktualizuje; oprava = nová verze.

---

## FLOW-06 AssignmentChangeNotification

**Trigger:** *When an item is created or modified* – IC_ControlRuns (a samostatný flow pro IC_Controls / IC_ControlVersions při nové verzi).
Trigger condition: `@not(equals(triggerOutputs()?['body/ModifiedSource'], 'Flow'))`.
**Akce:**
1. *Get changes for an item or a file (properties only)* – `Since` = `triggerOutputs()?['body/{TriggerWindowStartToken}']` (standardní akce SharePointu).
2. Podmínky:
   - `HasColumnChanged/AssignedOwnerEmail` → upozornění „Nově přidělená kontrola“ nové osobě (klíč `RunId|Assignment|<email>|<ModifiedAt>`).
   - `HasColumnChanged/DueDate` → „Změna termínu“ odpovědné osobě.
   - `HasColumnChanged/WorkflowState` a nový stav `Submitted` → „Žádost o schválení“ schvalovateli (klíč `RunId|ApprovalRequest|<ReturnCount+1>|reviewer`).
   - nový stav `Returned` → „Vráceno k doplnění“ provádějícímu; `Completed` u schvalovaných → „Schváleno“.
3. `Create item` IC_Notifications + e-mail (jako FLOW-02) + log.
**Pozn.:** Power Apps tak nemusí posílat poštu sama (méně oprávnění pro uživatele).

---

## FLOW-07 MonitorAutomationFailures

**Trigger:** (a) *Manually trigger a flow* jako **child flow** volaný z Catch scope ostatních flow (vstupy FlowName, RunUrl, Message);
(b) *Recurrence* každou hodinu pro opakování doručení.
**Akce (b):**
1. `Get items` IC_Notifications – `DeliveryStatus eq 'Failed' and RetryCount lt <maxRetries>`.
2. Pro každou: znovu odeslat e-mail; úspěch → `Sent`; chyba → `RetryCount + 1`, při dosažení maxima upozornění administrátorovi (klíč `NotificationId|AutomationFailure`).
3. `Get items` IC_AutomationLog za posledních 24 h se `Status eq 'Failed'` → souhrn administrátorovi (1× denně).
4. Kontrola „zdraví“: pokud poslední úspěšný FLOW-01/02/03 je starší než 26 h → upozornění (flow neběží / připojení expirovalo).
**Licence:** standard.

---

## Doplňkový flow: FLOW-UploadEvidence (z Power Apps)

Trigger *Power Apps (V2)* s parametrem typu **File** + texty `RunId`, `ControlCode`, `RunCode`, `EvidenceDefId`, `UploadedBy`.
Ověří, že běh je `InProgress`/`Returned`/`Planned` a volající je odpovědná osoba/zástupce/koordinátor;
*Create new folder* (pokud chybí) → *Create file* → *Update file properties* → audit → odpověď (`documentid`).

## Testování flow

1. Testovací web s kopií seznamů; FLOW-01 spustit 2× za sebou → druhý běh vytvoří 0 položek.
2. Simulace výpadku: vypnout FLOW-02 na 3 dny → po zapnutí přijde jen nejbližší připomínka.
3. Duplicitní spuštění FLOW-02 souběžně (2 ruční běhy) → unikátní klíč zabrání dvojímu záznamu.
4. FLOW-04: schválení stejnou osobou, která provedla (simulovat přímou editací seznamu) → protokol se nevytvoří, admin dostane upozornění.
5. Smyčky: úprava položky flowem nesmí znovu spustit FLOW-04/06 (ověřit historii běhů).
