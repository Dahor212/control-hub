# SHAREPOINT_SCHEMA – datový model pro SharePoint Online

Tento dokument popisuje přesnou strukturu seznamů a knihoven, do kterých se převádí datová vrstva
referenční aplikace CONTROL HUB. Interní názvy sloupců jsou **shodné s názvy polí v `src/domain/types.ts`**,
takže výrazy Power Fx i OData filtry lze převzít bez překladu.

## 1. Obecné konvence

| Téma | Pravidlo | Proč |
|---|---|---|
| Interní názvy | Sloupce zakládejte **nejdříve s anglickým interním názvem** (např. `DueDate`), teprve potom přejmenujte zobrazovaný název do češtiny. | Interní název nelze později změnit; Power Fx a OData používají interní název. |
| Sloupec `Title` | Ponechte, ale používejte jako lidsky čitelný klíč (např. `ControlCode`, `RunCode`). Nepovinný, pokud to seznam dovolí. | Zobrazení ve výchozích pohledech. |
| Identifikátory | Každý záznam má **GUID** v textovém sloupci (`ControlId`, `RunId`…), indexovaný a s vynucenou jedinečností. Vazby mezi seznamy jsou přes tyto GUID, **ne přes Lookup**. | Lookup sloupce mají limit 12 v pohledu, komplikují delegaci a export; GUID přežije migraci i kopii seznamu. GUID generuje Power Fx `GUID()` nebo Power Automate `guid()`. |
| Výčty (stavy, role…) | **Jeden řádek textu** + ověření sloupce (column validation), nikoli Choice. | Jednodušší `Patch` (bez `{Value: …}`), delegovatelná rovnost, jednodušší OData (`WorkflowState eq 'Planned'`). |
| Osoby | E-mail jako **jeden řádek textu malými písmeny** (indexovaný) – např. `AssignedOwnerEmail`. Volitelně souběžný sloupec typu Osoba (`AssignedOwner`) jen pro zobrazení. | Filtr na text je delegovatelný a indexovatelný; e-mail je stabilní napříč tenanty a exporty. |
| Kalendářní dny | Typ **Datum a čas – jen datum** (Date only). Význam: den v časovém pásmu Europe/Prague. | Termíny jsou dny, ne okamžiky. |
| Okamžiky | Typ **Datum a čas – datum a čas** (uloženo UTC). | Časové značky workflow (`SubmittedAt`, `ApprovedAt`…). |
| Složité struktury | **Více řádků textu – prostý text** (bez rich textu) s JSON. Pozor: nezapínat „Připojit změny k existujícímu textu“. | `RecurrenceSettings`, `ChecklistDefinition`, `ChecklistResults`, snapshoty. Power Fx čte přes `ParseJSON()`, zapisuje přes `JSON()`. |
| Souběžnost | Číselný sloupec `RowVersion` (celé číslo, výchozí 1). Každý zápis jej zvyšuje o 1 a před zápisem se porovná. | Optimistická souběžnost nezávislá na konektoru (viz kap. 6). |
| Zdroj změny | Sloupec `ModifiedSource` (text: `App` / `Flow`). | Zabránění nekonečným smyčkám v Power Automate (trigger conditions). |
| Indexy | Max. **20 indexů na seznam**. Indexy zakládejte **před** překročením 5 000 položek. | Prahová hodnota zobrazení seznamu (List View Threshold) 5 000. |
| Měkké mazání | Historické záznamy se nemažou; používejte `IsActive`, `IsRemoved`, `WorkflowState = Cancelled`, `IsSuperseded`. | Auditovatelnost. |

> **Prahová hodnota 5 000:** dotaz nad seznamem s > 5 000 položkami musí jako **první podmínku** použít indexovaný sloupec, který vrátí ≤ 5 000 položek. Proto jsou v `IC_ControlRuns` indexované `ControlId`, `DueMonthKey`, `AssignedOwnerEmail`, `IsOpen` a `DueDate`.

## 2. Přehled seznamů a knihoven

| Kód | Název | Typ | Odhad objemu | Účel |
|---|---|---|---|---|
| A | `IC_Controls` | seznam | stovky | stabilní identita kontroly (katalog) |
| B | `IC_ControlVersions` | seznam | stovky–tisíce | historicky platné verze definice a plánu |
| C | `IC_ControlRuns` | seznam | **10 000–50 000+** | jednotlivé výskyty (běhy) kontrol |
| D | `IC_Findings` | seznam | stovky–tisíce | zjištění a nápravná opatření |
| E | `IC_AuditLog` | seznam (append-only) | **desítky tisíc+** | auditní stopa |
| F | `IC_Notifications` | seznam | desítky tisíc | evidence upozornění a deduplikace |
| G | `IC_RoleAssignments` | seznam | desítky | role uživatelů |
| H | `IC_ReportSnapshots` | seznam | desítky | archiv měsíčních reportů (snapshot metrik) |
| I | `IC_Settings` | seznam (klíč/hodnota) | desítky | centrální konfigurace |
| J | `IC_Lookups` | seznam | desítky | číselníky (útvary, kategorie, priority…) |
| K | `IC_Protocols` | seznam | tisíce | neměnné snapshoty kontrolních protokolů |
| L | `IC_AutomationLog` | seznam | tisíce | technický stav automatizací |
| M | `IC_Holidays` | seznam | desítky | státní svátky / nepracovní dny |
| – | `IC_ControlDocuments` | knihovna | tisíce souborů | důkazy a protokoly ke kontrolám |
| – | `IC_ManagementReports` | knihovna | desítky | PDF měsíčních reportů |

Seznamy J–M nejsou výslovně v zadání; jsou nutné pro číselníky (správa v Administraci), neměnné protokoly,
technický stav a výpočet pracovních dnů.

Legenda sloupců tabulek níže: **P** = povinné, **I** = indexovaný, **U** = vynutit jedinečné hodnoty.

## 3. Seznamy

### A. IC_Controls – katalog kontrol

| Interní název | Zobrazovaný název | Typ SharePoint | P | I | U | Poznámka |
|---|---|---|---|---|---|---|
| `Title` | Kód | Jeden řádek textu | ✔ | | | = `ControlCode` |
| `ControlId` | ID kontroly | Jeden řádek textu (36) | ✔ | ✔ | ✔ | GUID |
| `ControlCode` | Kód kontroly | Jeden řádek textu (20) | ✔ | ✔ | ✔ | `CTRL-0001`; neměnný |
| `Name` | Název | Jeden řádek textu (255) | ✔ | | | aktuální název (denormalizace z poslední verze) |
| `Category` | Oblast | Jeden řádek textu (40) | ✔ | ✔ | | kód z `IC_Lookups` (LookupType = Category) |
| `Department` | Útvar | Jeden řádek textu (20) | ✔ | ✔ | | kód útvaru |
| `IsActive` | Aktivní | Ano/Ne | ✔ | ✔ | | výchozí Ano |
| `CreatedAt` | Založeno | Datum a čas | ✔ | | | |
| `CreatedBy` | Založil | Jeden řádek textu | ✔ | | | e-mail |
| `ArchivedAt` | Archivováno | Datum a čas | | | | |
| `ArchiveReason` | Důvod archivace | Více řádků textu | | | | povinné při archivaci (validace v aplikaci) |
| `CurrentVersionId` | Aktuální verze (ID) | Jeden řádek textu | ✔ | | | GUID poslední verze |
| `CurrentVersionNumber` | Číslo verze | Číslo (0 des. míst) | ✔ | | | |
| `OwnerEmail` | Odpovědná osoba | Jeden řádek textu | ✔ | ✔ | | denormalizace z verze – filtr registru |
| `RiskLevel` | Rizikovost | Jeden řádek textu | ✔ | | | `Low/Medium/High/Critical` |
| `RecurrenceType` | Frekvence | Jeden řádek textu | ✔ | | | viz B |
| `ModifiedAt`, `ModifiedBy` | Změněno / Změnil | Datum a čas / text | ✔ | | | aplikační (nezávislé na systémovém `Modified`) |
| `RowVersion` | Verze řádku | Číslo | ✔ | | | souběžnost |

Ověření seznamu (List validation): `=IF([IsActive]=FALSE,NOT(ISBLANK([ArchiveReason])),TRUE)` – archivovaná kontrola musí mít důvod.

### B. IC_ControlVersions – verze definic a plánů

| Interní název | Typ | P | I | U | Poznámka |
|---|---|---|---|---|---|
| `Title` | text | ✔ | | | `CTRL-0001 v2` |
| `VersionId` | text (36) | ✔ | ✔ | ✔ | GUID |
| `ControlId` | text (36) | ✔ | ✔ | | vazba na A |
| `ControlCode` | text | ✔ | ✔ | | denormalizace |
| `VersionNumber` | číslo | ✔ | | | 1, 2, 3… |
| `EffectiveFrom` | datum (jen datum) | ✔ | | | |
| `EffectiveTo` | datum (jen datum) | | | | prázdné = platí dosud; při nové verzi = den před `EffectiveFrom` nové verze |
| `ControlName` | text (255) | ✔ | | | název platný ve verzi |
| `Description` | více řádků (prostý) | | | | |
| `ControlObjective` | více řádků | ✔ | | | |
| `Instructions` | více řádků | ✔ | | | metodika |
| `RiskLevel` | text | ✔ | | | |
| `Priority` | text | ✔ | | | `Low/Normal/High` |
| `PrimaryOwnerEmail` | text | ✔ | ✔ | | |
| `BackupOwnerEmail` | text | | | | |
| `ReviewerEmail` | text | | | | povinné, je-li `ApprovalRequired` |
| `RecurrenceType` | text | ✔ | | | `OneTime/Daily/Workday/Weekly/Monthly/Quarterly/SemiAnnual/Annual` |
| `RecurrenceInterval` | číslo | ✔ | | | N (každých N týdnů/měsíců/dní) |
| `RecurrenceSettings` | více řádků (JSON) | ✔ | | | `{startDate,endDate,daysOfWeek[],monthlyMode,dayOfMonth,workdayNumber,invalidDayPolicy,nonWorkingDayShift,periodMode}` |
| `DueDateRule` | více řádků (JSON) | ✔ | | | `{offset,unit:"CalendarDays"|"Workdays",shift}` |
| `RequiredEvidence` | více řádků (JSON) | | | | `[{id,name,description,mandatory}]` |
| `ChecklistDefinition` | více řádků (JSON) | ✔ | | | `[{id,label,guidance,required}]` |
| `ApprovalRequired` | Ano/Ne | ✔ | | | princip čtyř očí |
| `ReminderPolicy` | více řádků (JSON) | ✔ | | | `{useGlobal,daysBefore[],overdueDays[],escalationAfterDays}` |
| `CreatedAt`, `CreatedBy` | datum a čas / text | ✔ | | | |
| `ChangeReason` | více řádků | ✔ | | | důvod změny (u v1 „Založení kontroly“) |

Verze jsou **neměnné**: po vytvoření se smí změnit jen `EffectiveTo` (a to pouze při založení následující verze).
Ověření: `=OR(ISBLANK([EffectiveTo]),[EffectiveTo]>=[EffectiveFrom]-1)`.

### C. IC_ControlRuns – běhy kontrol

Nejobjemnější seznam. Denormalizované sloupce (`ControlCode`, `Department`, `RiskLevel`…) umožňují filtrovat
bez lookupů; při změně definice je aktualizuje FLOW-01 jen u **nedokončených** běhů.

| Interní název | Typ | P | I | U | Poznámka |
|---|---|---|---|---|---|
| `Title` | text | ✔ | | | `CTRL-0001 RUN-2026-10` |
| `RunId` | text (36) | ✔ | ✔ | ✔ | GUID |
| `ControlId` | text (36) | ✔ | ✔ | | **index č. 1 pro historii kontroly** |
| `VersionId` | text (36) | ✔ | | | verze, podle které se běh provádí |
| `VersionNumber` | číslo | ✔ | | | |
| `ControlCode`, `ControlName` | text | ✔ | | | denormalizace |
| `Department` | text | ✔ | ✔ | | filtr útvaru (manažer) |
| `Category`, `RiskLevel`, `RecurrenceType` | text | ✔ | | | |
| `OccurrenceKey` | text (60) | ✔ | ✔ | ✔ | **idempotence**: `CTRL-0001|2026-11-20`; u nahrazených výskytů `…#S-xxxxxxxx` |
| `RunCode` | text (30) | ✔ | | | `RUN-2026-10`, `RUN-2026-Q4`, `RUN-20261120`… = název složky |
| `NominalDate` | datum | ✔ | | | datum dle pravidla před posunem |
| `PeriodFrom`, `PeriodTo` | datum | ✔ | | | kontrolované období |
| `ScheduledDate` | datum | ✔ | ✔ | | kalendář |
| `DueDate` | datum | ✔ | ✔ | | termín splnění |
| `DueMonthKey` | text (7) | ✔ | ✔ | | `2026-11` – delegovatelné měsíční dotazy pod 5 000 |
| `AssignedOwnerEmail` | text | ✔ | ✔ | | **index pro „Moje kontroly“** |
| `BackupOwnerEmail` | text | | ✔ | | |
| `ReviewerEmail` | text | | ✔ | | fronta ke schválení |
| `ApprovalRequired` | Ano/Ne | ✔ | | | kopie z verze v okamžiku vzniku/aktualizace |
| `WorkflowState` | text | ✔ | ✔ | | `Planned/InProgress/Submitted/Returned/Completed/Cancelled` |
| `IsOpen` | Ano/Ne | ✔ | ✔ | | true pro vše kromě Completed/Cancelled |
| `StartedAt`, `SubmittedAt`, `CompletedAt`, `ApprovedAt` | datum a čas | | | | |
| `PerformedDate` | datum | | | | **doporučený pomocný sloupec v Power Apps**: pražský den posledního odeslání (= `toPragueDate(SubmittedAt)` v React) – zjednodušuje výpočet včasnosti |
| `CompletedBy` | text | | | | provádějící (performer) |
| `ApprovedBy` | text | | | | ≠ `CompletedBy` (4 oči) |
| `Result` | text | | | | `NoFindings/WithFindings/PartiallyMet/NotMet/NotAssessable` |
| `ResultComment` | více řádků | | | | |
| `ExceptionReason` | více řádků | | | | důvod výjimky / zrušení / opravy |
| `ChecklistResults` | více řádků (JSON) | ✔ | | | `[{itemId,label,required,answer:"OK"|"NOK"|"NA"|null,comment}]` |
| `ReturnCount` | číslo | ✔ | | | výchozí 0 |
| `ReturnComment` | více řádků | | | | |
| `IsOneTimeOverride` | Ano/Ne | ✔ | | | jednorázová úprava |
| `OverrideNote` | text | | | | |
| `IsSuperseded` | Ano/Ne | ✔ | ✔ | | nahrazený výskyt (nezapočítává se) |
| `SupersededByVersionId` | text | | | | |
| `IsCorrection` | Ano/Ne | ✔ | | | probíhá řízená oprava |
| `ProtocolId` | text | | | | platný protokol |
| `ProtocolUrl` | text / hypertextový odkaz | | | | cesta k PDF v knihovně |
| `CreatedAt`, `ModifiedAt`, `ModifiedBy`, `RowVersion`, `ModifiedSource` | | ✔ | | | |

Doporučené indexy (12 z 20): `RunId`, `ControlId`, `OccurrenceKey`, `DueMonthKey`, `DueDate`, `ScheduledDate`,
`AssignedOwnerEmail`, `BackupOwnerEmail`, `ReviewerEmail`, `WorkflowState`, `IsOpen`, `Department`, `IsSuperseded`.

### D. IC_Findings

| Interní název | Typ | P | I | U | Poznámka |
|---|---|---|---|---|---|
| `FindingId` | text (36) | ✔ | ✔ | ✔ | GUID |
| `FindingCode` | text | ✔ | ✔ | ✔ | `FND-2026-0001` |
| `RunId` | text | ✔ | ✔ | | |
| `ControlId`, `ControlCode`, `Department` | text | ✔ | ✔ (ControlId, Department) | | |
| `FindingDescription` | více řádků | ✔ | | | |
| `CorrectiveAction` | více řádků | | | | nápravné opatření |
| `Severity` | text | ✔ | | | `Low/Medium/High/Critical` |
| `ResponsiblePerson` | text (e-mail) | ✔ | ✔ | | |
| `DueDate` | datum | ✔ | ✔ | | |
| `Status` | text | ✔ | ✔ | | `Open/InProgress/Closed` |
| `ResolutionComment` | více řádků | | | | povinné pro Closed |
| `ClosedAt` | datum a čas | | | | |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy`, `RowVersion` | | ✔ | | | |

Ověření seznamu: `=IF([Status]="Closed",NOT(ISBLANK([ResolutionComment])),TRUE)`.

### E. IC_AuditLog (append-only)

| Interní název | Typ | P | I | Poznámka |
|---|---|---|---|---|
| `AuditId` | text (36) | ✔ | ✔ (U) | GUID |
| `EntityType` | text | ✔ | ✔ | `Control/ControlVersion/ControlRun/Finding/Document/Protocol/Settings/RoleAssignment/Lookup/Report/System` |
| `EntityId` | text | ✔ | ✔ | |
| `ControlId` | text | | ✔ | „vše ke kontrole“ |
| `Action` | text (255) | ✔ | | např. „Jednorázová úprava výskytu“ |
| `FieldName` | text | | | |
| `OldValue`, `NewValue` | více řádků (prostý) | | | hodnoty jako text / JSON |
| `ChangedBy` | text | ✔ | ✔ | |
| `ChangedAt` | datum a čas | ✔ | ✔ | |
| `ChangeReason` | více řádků | | | povinné u změn plánu, odpovědnosti, termínu, archivace, opravy |

**Append-only zajištění:** vlastní úroveň oprávnění „Pouze přidávat“ (Zobrazit položky + Přidat položky, bez
Upravit/Odstranit) pro všechny uživatele aplikace; Upravit/Odstranit mají jen správci webu. Doporučeno zapnout
správu verzí a štítek uchovávání (retention label) „Záznam“, pokud je k dispozici Microsoft Purview.

### F. IC_Notifications

| Interní název | Typ | P | I | U | Poznámka |
|---|---|---|---|---|---|
| `NotificationId` | text (36) | ✔ | ✔ | ✔ | |
| `RunId`, `ControlId` | text | | ✔ (RunId) | | |
| `RecipientEmail` | text | ✔ | ✔ | | |
| `NotificationType` | text | ✔ | | | `Assignment/AssignmentChange/DueReminder/Overdue/Escalation/ApprovalRequest/ApprovalPending/Returned/Approved/DailyDigest/AutomationFailure` |
| `Subject` | text (255) | ✔ | | | |
| `Body` | více řádků | | | | |
| `Reason` | více řádků | ✔ | | | proč vzniklo (pravidlo + hodnoty) |
| `PlannedSendAt`, `SentAt` | datum a čas | | | | |
| `DeliveryStatus` | text | ✔ | ✔ | | `Pending/Sent/Failed/Digested/Cancelled` |
| `DeduplicationKey` | text (255) | ✔ | ✔ | ✔ | **zabraňuje duplicitám i při souběžném běhu flow** |
| `RetryCount` | číslo | ✔ | | | |
| `ErrorMessage` | více řádků | | | | |
| `DigestId` | text | | | | vazba na souhrnnou zprávu |
| `ReadAt` | datum a čas | | | | přečteno v aplikaci |
| `CreatedAt` | datum a čas | ✔ | ✔ | | |

### G. IC_RoleAssignments

| Interní název | Typ | P | I | Poznámka |
|---|---|---|---|---|
| `AssignmentId` | text (36) | ✔ | ✔ (U) | |
| `UserEmail` | text | ✔ | ✔ | |
| `Role` | text | ✔ | | `Administrator/Coordinator/ControlOwner/Reviewer/Manager/Auditor` |
| `DepartmentScope` | text | ✔ | | `ALL` nebo kód útvaru |
| `IsActive` | Ano/Ne | ✔ | | |

### H. IC_ReportSnapshots

| Interní název | Typ | P | I | Poznámka |
|---|---|---|---|---|
| `ReportId` | text | ✔ | ✔ (U) | `RPT-2026-10-ALL-V1` |
| `ReportingMonth`, `ReportingYear` | číslo | ✔ | ✔ (Year) | |
| `DepartmentScope` | text | ✔ | | |
| `GeneratedAt`, `GeneratedBy` | datum a čas / text | ✔ | | |
| `SnapshotData` | více řádků (JSON) | ✔ | | zmrazené metriky (`MonthlyReportData`) – **neaktualizovat** |
| `ContentHash` | text | | | SHA-256 snapshotu (v Power Platform viz POWER_AUTOMATE_FLOWS, FLOW-04/05) |
| `ReportFileUrl` | hypertextový odkaz | | | PDF v `IC_ManagementReports` |
| `DocumentId` | text | | | |
| `ReportVersion` | číslo | ✔ | | 1, 2… při opakovaném vygenerování |

### I. IC_Settings (klíč / hodnota)

| Interní název | Typ | Poznámka |
|---|---|---|
| `Title` | text (U, I) | klíč, např. `reminderDaysBefore` |
| `SettingValue` | více řádků | hodnota (číslo, text nebo JSON pole `[7,3,1,0]`) |
| `Description` | více řádků | význam |

Klíče: `reminderDaysBefore`, `overdueDaysAfter`, `escalationAfterDays`, `escalateToManager`, `escalateToCoordinator`,
`approvalReminderDays`, `digestMode`, `dueSoonDays`, `planningHorizonMonths`, `defaultDueRule`,
`defaultNonWorkingDayShift`, `defaultInvalidDayPolicy`, `maxRetries`, `coordinatorEmail`, `adminEmail`,
`senderMailbox`. (Klíče `testDate`, `simulatedFailureRate`, `paReferenceMode` existují **jen v demu**.)

### J. IC_Lookups

| Interní název | Typ | P | Poznámka |
|---|---|---|---|
| `LookupId` | text (U, I) | ✔ | `Department-PRI` |
| `LookupType` | text (I) | ✔ | `Department/Category/Priority/RiskLevel/ResultType` |
| `Code` | text | ✔ | stabilní kód (neměnný) |
| `Title` | text | ✔ | = `Label` (zobrazovaný název) |
| `SortOrder` | číslo | ✔ | |
| `IsActive` | Ano/Ne | ✔ | |
| `ManagerEmail` | text | | vedoucí útvaru – příjemce eskalací |

### K. IC_Protocols

| Interní název | Typ | P | I | Poznámka |
|---|---|---|---|---|
| `ProtocolId` | text (U, I) | ✔ | ✔ | `PRT-CTRL-0001-RUN-2026-10-V1` |
| `RunId`, `ControlId` | text | ✔ | ✔ | |
| `ProtocolVersion` | číslo | ✔ | | |
| `Status` | text | ✔ | | `Valid/Superseded` |
| `SnapshotData` | více řádků (JSON) | ✔ | | neměnný obsah protokolu |
| `ContentHash` | text | | | |
| `GeneratedAt`, `GeneratedBy` | | ✔ | | |
| `DocumentId` | text | | | PDF v knihovně |
| `SupersededBy` | text | | | |
| `CorrectionReason` | více řádků | | | u opravené verze |

Oprávnění: přidávat smí jen servisní účet FLOW-04; uživatelé jen číst.

### L. IC_AutomationLog

`LogId` (U, I), `FlowName` (I), `StartedAt` (I), `FinishedAt`, `Status` (`Succeeded/Failed/PartiallySucceeded`),
`ItemsProcessed`, `ItemsCreated`, `ItemsSkipped`, `ErrorCount` (čísla), `Message` (více řádků), `TriggeredBy` (text),
doporučeně i `RunUrl` (odkaz na běh flow – `workflow()?['run']?['name']`).

### M. IC_Holidays

`HolidayId` (U), `HolidayDate` (datum, I), `Title` (= název svátku). Plní se jednou ročně (Velikonoce jsou pohyblivé);
v demu se české svátky dopočítávají automaticky (`src/domain/dates.ts`).

## 4. Knihovny dokumentů

### IC_ControlDocuments

Struktura složek (stabilní identifikátory, přejmenování kontroly vazby nerozbije):

```
IC_ControlDocuments
└── CTRL-0001
    ├── RUN-2026-10
    │   ├── Evidence        ← důkazy nahrané provádějícím
    │   └── Protocols       ← PDF protokoly (PRT-…-V1.pdf, PRT-…-V2.pdf)
    └── Methodology         ← volitelně metodiky ke kontrole
```

| Metadata (sloupec knihovny) | Typ | Poznámka |
|---|---|---|
| `DocumentId` | text (U, I) | GUID |
| `ControlId`, `ControlCode` | text (I) | |
| `RunId`, `RunCode` | text (I: RunId) | |
| `DocumentType` | text | `Evidence/Protocol/Methodology/Other` |
| `EvidenceDefId` | text | který požadovaný dokument soubor plní (`RequiredEvidence[].id`) |
| `UploadedAt`, `UploadedBy` | datum a čas / text | |
| `IsRemoved`, `RemovedAt`, `RemovedBy`, `RemovedReason` | | měkké odebrání (soubor zůstává) |
| `ProtocolId` | text | u protokolů |

Nastavení knihovny: správa hlavních verzí (min. 50), vyžadovat rezervaci **vypnuto** (nahrává flow), složky
zakládá flow. Protokoly doporučeno označit štítkem uchovávání „Záznam“ (Purview), pokud je dostupný – pak je nelze upravit ani smazat.

### IC_ManagementReports

`IC_ManagementReports/2026/2026-10/RPT-2026-10-ALL-V1.pdf`; metadata `ReportId` (U), `ReportingYear`, `ReportingMonth`,
`DepartmentScope`, `ReportVersion`, `GeneratedAt`, `GeneratedBy`.

## 5. Vazby (logický model)

```
IC_Controls (ControlId) 1 ──< IC_ControlVersions (ControlId)
IC_Controls (ControlId) 1 ──< IC_ControlRuns (ControlId) >── 1 IC_ControlVersions (VersionId)
IC_ControlRuns (RunId) 1 ──< IC_Findings (RunId)
IC_ControlRuns (RunId) 1 ──< IC_Protocols (RunId)
IC_ControlRuns (RunId) 1 ──< IC_ControlDocuments (RunId)
IC_ControlRuns (RunId) 1 ──< IC_Notifications (RunId)
* (EntityId, ControlId) ──< IC_AuditLog
IC_ReportSnapshots (ReportId) 1 ── 1 IC_ManagementReports (ReportId)
IC_Lookups (Department.Code) ── Department v A, C, D
```

## 6. Souběžné úpravy

1. Aplikace při otevření záznamu uloží `RowVersion`.
2. Před zápisem znovu načte záznam (`LookUp(...)`) a porovná `RowVersion`. Při neshodě zápis odmítne a nabídne
   načtení aktuálního stavu (React: `ConcurrencyError`, Power Fx: viz POWERAPPS_MIGRATION, kap. C.7).
3. Zápis nastaví `RowVersion = RowVersion + 1`.
4. Pro kritické přechody v Power Automate použijte „Send an HTTP request to SharePoint“ (standardní konektor) s
   hlavičkou `If-Match: <etag>` – SharePoint pak sám vrátí 412 při souběžné změně.

Okno mezi kontrolou a zápisem v Power Fx není atomické (řádově stovky ms). Pro auditní účely je to přijatelné;
pokud nestačí, přesuňte přechod stavu do flow s `If-Match`.

## 7. Oprávnění SharePointu (skutečné zabezpečení)

| Skupina SharePoint | Členové | Seznamy A, B, J, M | C (Runs), D, K, dokumenty | E (Audit) | F, L | H, reporty | G, I |
|---|---|---|---|---|---|---|---|
| IC Administrátoři | Administrator | Úplné řízení | Úplné řízení | Úplné řízení | Úplné řízení | Úplné řízení | Úplné řízení |
| IC Koordinátoři | Coordinator | Upravit | Upravit | Pouze přidávat | Upravit | Upravit | Číst |
| IC Uživatelé | Owner, Reviewer, Manager | Číst | Přispívat (bez odstraňování*) | Pouze přidávat | Přispívat | Číst | Číst |
| IC Auditoři | Auditor | Číst | Číst | Číst | Číst | Číst | Číst |
| Servisní účet flow | – | Upravit | Upravit | Pouze přidávat | Upravit | Upravit | Číst |

\* Vlastní úroveň „Přispívat bez odstraňování“ = Přispívat minus „Odstranit položky“.

**Omezení:** skrytí tlačítka v Power Apps není zabezpečení – uživatel s právem *Upravit* na seznamu může položku
změnit i přímo v SharePointu, přes Excel nebo Power Automate. Proto:
- citlivé přechody (schválení, uzavření, protokol) provádějte flow pod servisním účtem a uživatelům dejte na
  `IC_ControlRuns` jen nezbytná práva;
- **oprávnění na úrovni položek** (unikátní oprávnění na běh) používejte střídmě: seznam podporuje max. 50 000
  unikátních oprávnění, Microsoft doporučuje držet se řádově pod 5 000 – jinak se zpomalí dotazy i správa.
  Alternativou je rozdělení citlivých dat do samostatného seznamu/webu s jiným oprávněním;
- auditní seznam chraňte úrovní „Pouze přidávat“ a ideálně štítkem uchovávání.
