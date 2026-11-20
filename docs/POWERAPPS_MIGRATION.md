# POWERAPPS_MIGRATION – převod do Power Apps (Canvas) + SharePoint + Power Automate

Cíl: ručně sestavit Canvas aplikaci v Power Apps Studio, která se chová jako referenční React aplikace.
Předpoklady prostředí (regulované bankovní prostředí):

- **jen standardní konektory** (SharePoint, Office 365 Users, Office 365 Outlook, OneDrive for Business, Approvals) –
  pokryto licencí Microsoft 365 (Power Apps/Power Automate for Office 365);
- žádný Dataverse, Azure Functions, vlastní API, HTTP konektor ani administrátorská práva v tenantu;
- data v SharePoint Online podle [SHAREPOINT_SCHEMA.md](SHAREPOINT_SCHEMA.md), automatizace podle
  [POWER_AUTOMATE_FLOWS.md](POWER_AUTOMATE_FLOWS.md), pravidla podle [BUSINESS_RULES.md](BUSINESS_RULES.md).

> **Oddělovače v Power Fx.** Vzorce níže jsou v en-US syntaxi (oddělovač argumentů `,`, řetězení příkazů `;`,
> desetinná tečka). Pokud vaše Power Apps Studio používá české/evropské oddělovače (podle jazyka prohlížeče, resp.
> Nastavení → Obecné → „Oddělovače vzorců“), nahraďte: `,` → `;` (argumenty), `;` → `;;` (řetězení), `.` → `,`
> (desetinná čísla v literálech). Příklad: `If(a, b; c)` v en-US = `If(a; b;; c)` v cs-CZ. Doporučení: pro vývoj
> přepněte prohlížeč do angličtiny – vzorce pak zkopírujete beze změny.

> **Jména sloupců.** Interní názvy sloupců SharePointu jsou shodné s názvy polí v React aplikaci (`DueDate`,
> `AssignedOwnerEmail`…). Pokud jste zobrazovaný název změnili do češtiny, Power Apps v návrhu ukáže zobrazovaný
> název, ve vzorcích ale funguje i interní název.

---

## A. Mapování obrazovek

| React obrazovka (route) | Power Apps obrazovka | Rozvržení | Hlavní datové zdroje | Navigace odsud |
|---|---|---|---|---|
| Dashboard (`/`) | `scrDashboard` | horizontální kontejnery: filtry → 6 KPI → grafy → provozní seznamy | `colPeriodRuns`, `colTrend`, `IC_AuditLog` | `scrRunList` (proklik KPI), `scrRunDetail` |
| Moje kontroly (`/my`) | `scrMyControls` | záložky (`tabMyControls`) + galerie karet | `IC_ControlRuns` (moje), `colMyRuns` | `scrRunDetail` |
| Registr kontrol (`/controls`) | `scrControlRegister` | filtry + `galControls` (tabulka) | `IC_Controls` | `scrControlDetail`, `scrControlWizard` |
| Detail kontroly (`/controls/:id`) | `scrControlDetail` | hlavička + záložky (Přehled, Běhy, Verze, Přílohy, Opatření, Protokoly, Audit) | `IC_Controls`, `IC_ControlVersions`, `IC_ControlRuns`, `IC_Findings`, `IC_Protocols`, `IC_AuditLog`, `IC_ControlDocuments` | `scrRunDetail`, `scrControlWizard` |
| Průvodce (dialog) | `scrControlWizard` | levý seznam kroků + pravý panel kroku | `IC_Lookups`, Office365Users | zpět na `scrControlDetail` |
| Detail běhu (`/runs/:id`) | `scrRunDetail` | hlavička + záložky (Přehled, Provedení, Přílohy, Opatření, Protokoly, Audit) | `IC_ControlRuns`, `IC_ControlVersions`, `IC_Findings`, `IC_ControlDocuments`, `IC_Protocols` | `scrControlDetail` |
| Seznam běhů (`/runs?view=`) | `scrRunList` | lišta filtrů + galerie | `colPeriodRuns` / delegovaný dotaz | `scrRunDetail` |
| Zjištění (`/findings`) | `scrFindings` | segmenty + galerie | `IC_Findings` | `scrRunDetail` |
| Kalendář (`/calendar`) | `scrCalendar` | měsíční mřížka `galCalendarDays` (42 dní) + panel události | `IC_ControlRuns` (rozsah měsíce) | `scrRunDetail` |
| Manažerský přehled (`/management`) | `scrManagement` | metriky + grafy + tabulky | `colPeriodRuns`, `colTrend12`, `IC_Findings` | `scrRunList`, `scrFindings` |
| Reporty (`/reports`) | `scrReports` | tlačítko generování + galerie archivu | `IC_ReportSnapshots`, `IC_ManagementReports` | PDF v knihovně |
| Upozornění (`/notifications`) | `scrNotifications` | záložky Moje / Evidence | `IC_Notifications` | `scrRunDetail` |
| Administrace (`/admin`) | `scrAdministration` | záložky Role, Číselníky, Pravidla, Opakování, Audit, Technický stav | `IC_RoleAssignments`, `IC_Lookups`, `IC_Settings`, `IC_AuditLog`, `IC_AutomationLog` | – |

Společná komponenta `cmpHeader` (vyhledávání, zvonek, uživatel) a `cmpNavigation` (levé menu) se vloží na každou
obrazovku. Demo prvky (přepínání uživatele, testovací datum, reset dat) se v Power Apps **neimplementují**.

### Podrobnosti obrazovek

**scrDashboard** – `conFilters` (Horizontal container): `drpPeriod`, `cmbDepartment`, `cmbOwner`, `cmbState`,
`cmbFrequency`, `cmbCategory`, `cmbRisk`, `btnResetFilters`. `conKpis` (Horizontal, wrap): 6× `conKpi*`
(Container + `lblKpiLabel`, `lblKpiValue`, `lblKpiHint`, `OnSelect` → proklik). `chtTrend` (Column chart),
`chtStatus` (Pie chart), `galDeptRates` (galerie s obdélníkem jako pruhem – grafy Power Apps neumí pruh s cílovou
čárou), `galTopRisky`, `galToday`, `galNext7`, `galOverdue`, `galRecentDone`, `galRecentChanges`.
Akce: změna filtrů → přepočet; klik na KPI → `Navigate(scrRunList, ScreenTransition.None, {locView: "overdue"})`.

**scrMyControls** – `tabMyControls` (Tab list / Galerie tlačítek), `galMyRuns` (karty: kód, název, období, termín,
stavové štítky, `btnRunAction`). Akce: otevřít běh.

**scrControlRegister** – `txtSearch`, `cmb*` filtry, `tglArchived`, `galControls` (řádek tabulky), `btnNewControl`,
`btnExportCsv` (flow). Akce: otevřít detail, nová kontrola.

**scrControlDetail** – `conControlHeader`, `tabControl`, galerie `galControlRuns`, `galVersions`,
`galControlDocs`, `galControlFindings`, `galProtocols`, `galControlAudit`; `btnEditDefinition`, `btnGenerate`,
`btnArchive` + `dlgArchive` (kontejner s `txtArchiveReason`).

**scrControlWizard** – `galWizardSteps` (7 kroků), kontejnery `conStep1`…`conStep7` (`Visible: locStep = n`),
`frm`-like vstupy, `galChecklistEdit` (editovatelná galerie nad kolekcí `colChecklistDef`), `galEvidenceEdit`,
`galOccurrencePreview`, v režimu úprav `galImpactPreview`, `dteEffectiveFrom`, `txtChangeReason`, `chkConfirmImpact`.

**scrRunDetail** – `conRunHeader`, `tabRun`; Provedení: `galChecklist` (`radChecklistAnswer`, `txtChecklistComment`),
`drpResult`, `txtResultComment`, `txtExceptionReason`, `conSubmitCheck`, `btnStartRun`, `btnSaveDraft`,
`btnCompleteControl`, `conReview` (`txtReviewComment`, `btnApprove`, `btnReturn`); Přílohy: `galRunDocuments`,
`attUpload` (Attachments control z formuláře) + `btnUpload`; Opatření: `galFindings`, `frmFinding`;
Protokoly: `galRunProtocols`, `btnOpenProtocol`; Audit: `galRunAudit`; dialogy `dlgScope`, `dlgOneTime`, `dlgCancel`, `dlgCorrection`.

---

## B. Mapování komponent

| Funkce (React) | Power Apps komponenta | Poznámka |
|---|---|---|
| Levé menu (`AppShell`) | Komponenta `cmpNavigation` s `galNavigation` nad `colNavItems` | `Visible` položky podle role |
| Globální vyhledávání | `TextInput` + `Gallery` | `StartsWith` nad `ControlCode`/`Name` (delegovatelné) |
| Zvonek upozornění | `Icon` + `Label` (počet) | `CountRows` nad kolekcí mých nepřečtených (≤ 2 000) |
| KPI karta (`Kpi`) | `Container` + 3× `Label`, `OnSelect` | hodnoty z `With()` nad kolekcí |
| Tabulka (`DataTable`) | `Gallery` (vertikální) s řádkem z kontejneru; řazení `SortByColumns` | Data table control neumí vlastní šablonu buněk |
| Stavový štítek (`WorkflowBadge`) | `Label` s `Fill`/`Color` dle `Switch()` + ikona | barva vždy s textem |
| Filtr – víceznačný výběr (`MultiSelect`) | `ComboBox` (`SelectMultiple = true`) | |
| Filtr období | `Dropdown` (předvolby) + 2× `DatePicker` | |
| Výběr osoby (`UserPicker`) | `ComboBox` + `Office365Users.SearchUserV2` | viz C.5 |
| Formulář detailu | `Edit form` / `Display form` nad `IC_ControlRuns` | provedení raději vlastní kontejner + `Patch` (JSON checklist) |
| Checklist | `Gallery` nad `colChecklist` + `Radio` + `TextInput` | z JSON přes `ParseJSON` |
| Dialog (`Dialog`) | `Container` přes celou obrazovku (`Visible: locShowX`) | modální překryv = obdélník s průhledností |
| Toast | `Notify()` | |
| Záložky (`Tabs`) | `Tab list` (moderní ovládací prvky) nebo galerie tlačítek | |
| Grafy (`Recharts`) | `Column chart`, `Pie chart`, `Line chart` (klasické grafy) | vstupní data: kolekce s čísly |
| Kalendář | `Gallery` (wrap 7) nad `Sequence(42)` | viz C.8 |
| Přílohy | `Attachments` control (z formuláře nad libovolným seznamem) → Power Automate „Create file“ | viz C.10 |
| PDF protokol | FLOW-04 (HTML → OneDrive „Convert file“ → PDF) | viz POWER_AUTOMATE_FLOWS |
| Export CSV | Power Automate „Create CSV table“ + uložení / e-mail | |
| Režim „Power Apps Reference“ | – | jen v React prototypu |

---

## C. Vzorce Power Fx

### C.1 App.OnStart (případně App.Formulas)

```powerfx
// --- Identita a role ---------------------------------------------------------------
Set(varUserEmail, Lower(User().Email));
ClearCollect(
    colMyRoles,
    Filter(IC_RoleAssignments, UserEmail = varUserEmail, IsActive = true)
);
// Výchozí aktivní role podle priority
Set(
    varActiveRole,
    Coalesce(
        LookUp(colMyRoles, Role = "Administrator").Role,
        LookUp(colMyRoles, Role = "Coordinator").Role,
        LookUp(colMyRoles, Role = "Manager").Role,
        LookUp(colMyRoles, Role = "Reviewer").Role,
        LookUp(colMyRoles, Role = "Auditor").Role,
        "ControlOwner"
    )
);
Set(varDeptScope, Coalesce(LookUp(colMyRoles, Role = varActiveRole).DepartmentScope, "ALL"));
Set(varCanManage, varActiveRole in ["Administrator", "Coordinator"]);   // in nad lokální tabulkou je OK

// --- Číselníky a nastavení (malé seznamy, ≤ 2 000 položek) ------------------------
ClearCollect(colLookups, Filter(IC_Lookups, IsActive = true));
ClearCollect(colDepartments, SortByColumns(Filter(colLookups, LookupType = "Department"), "SortOrder", SortOrder.Ascending));
ClearCollect(colCategories, SortByColumns(Filter(colLookups, LookupType = "Category"), "SortOrder", SortOrder.Ascending));
ClearCollect(colSettings, IC_Settings);
Set(varDueSoonDays, Value(LookUp(colSettings, Title = "dueSoonDays").SettingValue));
Set(varHorizonMonths, Value(LookUp(colSettings, Title = "planningHorizonMonths").SettingValue));
ClearCollect(
    colHolidays,
    Filter(IC_Holidays, HolidayDate >= DateAdd(Today(), -400, TimeUnit.Days), HolidayDate <= DateAdd(Today(), 800, TimeUnit.Days))
);

// --- Moje otevřené běhy (typicky desítky) ------------------------------------------
ClearCollect(
    colMyRuns,
    Filter(
        IC_ControlRuns,
        IsOpen = true,
        AssignedOwnerEmail = varUserEmail || BackupOwnerEmail = varUserEmail
    )
);
Set(varToday, Today());
```

Předpoklady a omezení:
- `User().Email` vrací UPN/primární e-mail; v tenantech, kde se liší od `mail`, použijte
  `Office365Users.MyProfileV2().mail`.
- `Today()` je den v časovém pásmu zařízení. Uživatelé v ČR → Europe/Prague. Pro jiné pásmo použijte
  `DateAdd(Now(), TimeZoneOffset(), TimeUnit.Minutes)` a ruční převod.
- **Skutečné zabezpečení neřeší role v aplikaci** – viz kap. F.
- Výkon: `App.OnStart` blokuje start; s rostoucím počtem kolekcí zvažte **App.Formulas** (pojmenované vzorce
  se vyhodnocují líně), např. `fxDepartments = SortByColumns(Filter(IC_Lookups, LookupType = "Department", IsActive = true), "SortOrder");`.

### C.2 Screen.OnVisible

`scrRunDetail.OnVisible` (předán `locRunId` přes `Navigate`):

```powerfx
UpdateContext({
    locRun: LookUp(IC_ControlRuns, RunId = locRunId),
    locTab: Coalesce(locTab, "overview"),
    locDirty: false
});
UpdateContext({
    locVersion: LookUp(IC_ControlVersions, VersionId = locRun.VersionId),
    locBaseRowVersion: locRun.RowVersion
});
// Checklist z JSON do upravitelné kolekce
ClearCollect(
    colChecklist,
    ForAll(
        Table(ParseJSON(locRun.ChecklistResults)),
        {
            itemId:   Text(ThisRecord.Value.itemId),
            label:    Text(ThisRecord.Value.label),
            required: Boolean(ThisRecord.Value.required),
            answer:   Text(ThisRecord.Value.answer),      // "OK" | "NOK" | "NA" | "" (null → "")
            comment:  Text(ThisRecord.Value.comment)
        }
    )
);
ClearCollect(colRunDocs, Filter(IC_ControlDocuments, RunId = locRun.RunId, IsRemoved = false));
ClearCollect(colRunFindings, Filter(IC_Findings, RunId = locRun.RunId));
ClearCollect(colRunProtocols, SortByColumns(Filter(IC_Protocols, RunId = locRun.RunId), "ProtocolVersion", SortOrder.Descending));
```

`ParseJSON` je v Power Fx obecně dostupný (GA). `Table(ParseJSON(...))` vrací tabulku s polem `Value` typu
Untyped Object – proto explicitní převody `Text()`, `Boolean()`.

`scrDashboard.OnVisible` – načtení běhů období (viz C.9):

```powerfx
UpdateContext({ locFrom: Date(Year(Today()), Month(Today()), 1) });
UpdateContext({ locTo: DateAdd(DateAdd(locFrom, 1, TimeUnit.Months), -1, TimeUnit.Days) });
ClearCollect(
    colPeriodRuns,
    Filter(IC_ControlRuns, DueDate >= locFrom, DueDate <= locTo, IsSuperseded = false)
);
```

### C.3 Gallery.Items

**Moje kontroly – po termínu** (`galMyRuns.Items`, záložka `locBucket = "overdue"`):

```powerfx
SortByColumns(
    Filter(
        colMyRuns,
        WorkflowState in ["Planned", "InProgress", "Returned"],
        DueDate < Today()
    ),
    "DueDate", SortOrder.Ascending
)
```

Všechny záložky nad kolekcí `colMyRuns` (vše lokálně, bez delegace):

```powerfx
Switch(
    locBucket,
    "todo",     Filter(colMyRuns, WorkflowState in ["Planned","InProgress","Returned"], ScheduledDate <= Today(), DueDate >= Today()),
    "today",    Filter(colMyRuns, WorkflowState in ["Planned","InProgress","Returned"], DueDate = Today()),
    "soon",     Filter(colMyRuns, WorkflowState in ["Planned","InProgress","Returned"], DueDate > Today(), DateDiff(Today(), DueDate, TimeUnit.Days) <= varDueSoonDays + 4),
    "overdue",  Filter(colMyRuns, WorkflowState in ["Planned","InProgress","Returned"], DueDate < Today()),
    "progress", Filter(colMyRuns, WorkflowState = "InProgress"),
    "pending",  Filter(colMyRuns, WorkflowState = "Submitted"),
    "returned", Filter(colMyRuns, WorkflowState = "Returned"),
    "review",   Filter(IC_ControlRuns, WorkflowState = "Submitted", ReviewerEmail = varUserEmail),  // delegovatelné
    colMyRuns
)
```

**Registr kontrol** (`galControls.Items`) – delegovatelný základ + lokální filtry nad malým seznamem:

```powerfx
SortByColumns(
    Filter(
        IC_Controls,
        tglArchived.Value || IsActive = true,
        IsBlank(txtSearch.Text) || StartsWith(ControlCode, Upper(txtSearch.Text)) || StartsWith(Name, txtSearch.Text),
        IsEmpty(cmbDepartment.SelectedItems) || Department in cmbDepartment.SelectedItems.Code,
        IsEmpty(cmbRisk.SelectedItems) || RiskLevel in cmbRisk.SelectedItems.Code
    ),
    "ControlCode", SortOrder.Ascending
)
```

`IC_Controls` má stovky položek (< 2 000) – nedelegovatelné části (`in`, `IsBlank(txt)`) jsou v pořádku, pokud
**datový limit aplikace** (Nastavení → Obecné → „Limit počtu řádků dat“) zvýšíte na 2 000. Pro registr nad 2 000
kontrol viz kap. D.

**Historie běhů kontroly** (`galControlRuns.Items`) – delegovatelné:

```powerfx
SortByColumns(
    Filter(IC_ControlRuns, ControlId = locControl.ControlId, IsSuperseded = false),
    "DueDate", SortOrder.Descending
)
```

**Auditní historie běhu**:

```powerfx
SortByColumns(Filter(IC_AuditLog, EntityId = locRun.RunId), "ChangedAt", SortOrder.Descending)
```

### C.4 Barvy a texty stavů (odvozený stav)

`lblTiming.Text`:

```powerfx
With(
    { r: ThisItem, d: DateDiff(Today(), ThisItem.DueDate, TimeUnit.Days) },
    Switch(
        true,
        r.WorkflowState = "Cancelled", "Zrušeno",
        r.WorkflowState = "Completed", If(r.PerformedDate > r.DueDate, "Dokončeno pozdě", "Dokončeno včas"),
        r.WorkflowState = "Submitted", "Čeká na schválení",
        d < 0, "Po termínu " & -d & " dní",
        d = 0, "Termín dnes",
        d <= varDueSoonDays, "Termín za " & d & " dní",
        r.ScheduledDate > Today(), "Naplánováno",
        "K provedení"
    )
)
```

`lblTiming.Fill`: `If(StartsWith(Self.Text, "Po termínu"), RGBA(254,242,242,1), StartsWith(Self.Text, "Termín"), RGBA(255,251,235,1), RGBA(241,245,249,1))`.

### C.5 ComboBox.Items – výběr osoby (Office 365 Users)

```powerfx
// cmbOwner.Items
Office365Users.SearchUserV2(
    {
        searchTerm: Self.SearchText,
        top: 15,
        isSearchTermRequired: false
    }
).value
```

Vlastnosti: `SearchFields = ["DisplayName","Mail"]`, `DisplayFields = ["DisplayName","Mail"]`, `IsSearchable = true`,
`DefaultSelectedItems = Filter(Office365Users.SearchUserV2({searchTerm: locVersion.PrimaryOwnerEmail, top: 1}).value, true)`.
Uložená hodnota: `Lower(cmbOwner.Selected.Mail)`. Konektor Office 365 Users je standardní; vyhledávání vrací max.
`top` výsledků a respektuje adresářová oprávnění uživatele.

### C.6 Button.OnSelect – zahájení, uložení, dokončení

**btnStartRun.OnSelect** (`startControlRun`):

```powerfx
With(
    { fresh: LookUp(IC_ControlRuns, RunId = locRun.RunId) },
    If(
        fresh.RowVersion <> locBaseRowVersion,
        Notify("Záznam mezitím změnil jiný uživatel. Načtěte aktuální stav.", NotificationType.Error),
        !(varUserEmail in [Lower(fresh.AssignedOwnerEmail), Lower(fresh.BackupOwnerEmail)]),
        Notify("Kontrolu může provést jen přidělený vlastník nebo zástupce.", NotificationType.Error),
        // jinak:
        Patch(
            IC_ControlRuns, fresh,
            {
                WorkflowState: "InProgress", IsOpen: true,
                StartedAt: Coalesce(fresh.StartedAt, Now()),
                ModifiedAt: Now(), ModifiedBy: varUserEmail, ModifiedSource: "App",
                RowVersion: fresh.RowVersion + 1
            }
        );
        Patch(IC_AuditLog, Defaults(IC_AuditLog), {
            AuditId: GUID(), EntityType: "ControlRun", EntityId: fresh.RunId, ControlId: fresh.ControlId,
            Action: "Zahájení provedení", FieldName: "WorkflowState", OldValue: fresh.WorkflowState, NewValue: "InProgress",
            ChangedBy: varUserEmail, ChangedAt: Now()
        });
        UpdateContext({ locRun: LookUp(IC_ControlRuns, RunId = locRun.RunId) });
        UpdateContext({ locBaseRowVersion: locRun.RowVersion })
    )
)
```

**btnSaveDraft.OnSelect** (`saveControlRunDraft`):

```powerfx
With(
    { fresh: LookUp(IC_ControlRuns, RunId = locRun.RunId) },
    If(
        fresh.RowVersion <> locBaseRowVersion,
        Notify("Záznam byl mezitím změněn (verze " & fresh.RowVersion & "). Změny nelze uložit.", NotificationType.Error),
        Patch(
            IC_ControlRuns, fresh,
            {
                ChecklistResults: JSON(colChecklist, JSONFormat.Compact),
                Result: drpResult.Selected.Code,
                ResultComment: txtResultComment.Text,
                ExceptionReason: txtExceptionReason.Text,
                ModifiedAt: Now(), ModifiedBy: varUserEmail, ModifiedSource: "App",
                RowVersion: fresh.RowVersion + 1
            }
        );
        UpdateContext({ locRun: LookUp(IC_ControlRuns, RunId = locRun.RunId), locDirty: false });
        UpdateContext({ locBaseRowVersion: locRun.RowVersion });
        Notify("Rozpracované provedení uloženo.", NotificationType.Success)
    )
)
```

Validace před odesláním – `conSubmitCheck` a `btnCompleteControl.DisplayMode`:

```powerfx
// Named formula / proměnná locSubmitErrors (tabulka textů)
UpdateContext({ locSubmitErrors:
    Filter(
        Table(
            { e: If(CountRows(Filter(colChecklist, required && IsBlank(answer))) > 0, "Vyplňte všechny povinné kontrolní kroky.") },
            { e: If(CountRows(Filter(colChecklist, answer = "NOK" && IsBlank(Trim(comment)))) > 0, "U kroků s nedostatkem doplňte komentář.") },
            { e: If(IsBlank(drpResult.Selected.Code), "Zvolte celkový výsledek.") },
            { e: If(drpResult.Selected.Code <> "NoFindings" && IsBlank(Trim(txtResultComment.Text)), "Komentář k výsledku je povinný.") },
            { e: If(drpResult.Selected.Code = "NotAssessable" && IsBlank(Trim(txtExceptionReason.Text)), "Uveďte důvod výjimky.") },
            { e: If(drpResult.Selected.Code = "NoFindings" && CountRows(Filter(colChecklist, answer = "NOK")) > 0, "Bez zjištění nelze při nedostatku.") },
            { e: If(drpResult.Selected.Code in ["WithFindings","NotMet"] && IsEmpty(colRunFindings), "Založte alespoň jedno zjištění.") },
            { e: If(
                CountRows(
                    Filter(
                        Table(ParseJSON(locVersion.RequiredEvidence)),
                        Boolean(ThisRecord.Value.mandatory),
                        IsBlank(LookUp(colRunDocs, EvidenceDefId = Text(ThisRecord.Value.id)))
                    )
                ) > 0,
                "Chybí povinné přílohy.") }
        ),
        !IsBlank(e)
    )
});
// btnCompleteControl.DisplayMode
If(IsEmpty(locSubmitErrors), DisplayMode.Edit, DisplayMode.Disabled)
```

**btnCompleteControl.OnSelect** (`submitControlRun` / `completeControlRun`):

```powerfx
With(
    {
        fresh: LookUp(IC_ControlRuns, RunId = locRun.RunId),
        target: If(locRun.ApprovalRequired, "Submitted", "Completed")
    },
    If(
        fresh.RowVersion <> locBaseRowVersion,
        Notify("Záznam byl mezitím změněn jiným uživatelem.", NotificationType.Error),
        fresh.ApprovalRequired && Lower(fresh.ReviewerEmail) = varUserEmail,
        Notify("Princip čtyř očí: jste určeným schvalovatelem. Požádejte koordinátora o změnu.", NotificationType.Error),
        Patch(
            IC_ControlRuns, fresh,
            {
                ChecklistResults: JSON(colChecklist, JSONFormat.Compact),
                Result: drpResult.Selected.Code,
                ResultComment: txtResultComment.Text,
                ExceptionReason: txtExceptionReason.Text,
                WorkflowState: target,
                IsOpen: target <> "Completed",
                SubmittedAt: If(fresh.IsCorrection && !IsBlank(fresh.SubmittedAt), fresh.SubmittedAt, Now()),
                PerformedDate: If(fresh.IsCorrection && !IsBlank(fresh.PerformedDate), fresh.PerformedDate, Today()),
                CompletedBy: varUserEmail,
                CompletedAt: If(target = "Completed", Now(), Blank()),
                ModifiedAt: Now(), ModifiedBy: varUserEmail, ModifiedSource: "App",
                RowVersion: fresh.RowVersion + 1
            }
        );
        Patch(IC_AuditLog, Defaults(IC_AuditLog), {
            AuditId: GUID(), EntityType: "ControlRun", EntityId: fresh.RunId, ControlId: fresh.ControlId,
            Action: If(target = "Completed", "Dokončení kontroly", "Odeslání ke schválení"),
            FieldName: "WorkflowState", OldValue: fresh.WorkflowState, NewValue: target,
            ChangedBy: varUserEmail, ChangedAt: Now()
        });
        // FLOW-04 se spustí triggerem na změnu položky (Completed). FLOW-06 pošle žádost schvalovateli.
        Navigate(scrMyControls, ScreenTransition.Fade);
        Notify(If(target = "Completed", "Kontrola dokončena. Protokol vytvoří automatizace.", "Odesláno ke schválení."), NotificationType.Success)
    )
)
```

**btnApprove.OnSelect** (`approveControlRun`, princip čtyř očí):

```powerfx
With(
    { fresh: LookUp(IC_ControlRuns, RunId = locRun.RunId) },
    If(
        fresh.WorkflowState <> "Submitted",
        Notify("Běh již nečeká na schválení.", NotificationType.Warning),
        Lower(fresh.ReviewerEmail) <> varUserEmail,
        Notify("Nejste určeným schvalovatelem.", NotificationType.Error),
        Lower(fresh.CompletedBy) = varUserEmail,
        Notify("Princip čtyř očí: provádějící nesmí kontrolu schválit.", NotificationType.Error),
        fresh.RowVersion <> locRun.RowVersion,
        Notify("Záznam byl mezitím změněn.", NotificationType.Error),
        Patch(IC_ControlRuns, fresh, {
            WorkflowState: "Completed", IsOpen: false,
            ApprovedAt: Now(), ApprovedBy: varUserEmail, CompletedAt: Now(),
            ModifiedAt: Now(), ModifiedBy: varUserEmail, ModifiedSource: "App",
            RowVersion: fresh.RowVersion + 1
        });
        Patch(IC_AuditLog, Defaults(IC_AuditLog), {
            AuditId: GUID(), EntityType: "ControlRun", EntityId: fresh.RunId, ControlId: fresh.ControlId,
            Action: "Schválení kontroly", FieldName: "WorkflowState", OldValue: "Submitted", NewValue: "Completed",
            ChangedBy: varUserEmail, ChangedAt: Now(), ChangeReason: txtReviewComment.Text
        });
        UpdateContext({ locRun: LookUp(IC_ControlRuns, RunId = locRun.RunId) })
    )
)
```

`btnApprove.DisplayMode`: `If(locRun.WorkflowState = "Submitted" && Lower(locRun.ReviewerEmail) = varUserEmail && Lower(locRun.CompletedBy) <> varUserEmail, DisplayMode.Edit, DisplayMode.Disabled)`.

**btnReturn.OnSelect** (`returnControlRun`): obdoba se stavem `"Returned"`, `ReturnCount: fresh.ReturnCount + 1`,
`ReturnComment: txtReviewComment.Text`; `DisplayMode` vyžaduje neprázdný komentář.

### C.7 Optimistická souběžnost – obecný vzor

```powerfx
With(
    { fresh: LookUp(<Seznam>, <IdSloupec> = <id>) },
    If(
        fresh.RowVersion <> <uloženáVerze>,
        Notify("Záznam byl mezitím změněn uživatelem " & fresh.ModifiedBy & ". Načtěte aktuální stav.", NotificationType.Error),
        Patch(<Seznam>, fresh, { ..., RowVersion: fresh.RowVersion + 1 })
    )
)
```

Kontrola a zápis nejsou atomické (viz SHAREPOINT_SCHEMA kap. 6). Pro chybu konektoru při `Patch` použijte
`IfError(Patch(...), Notify("Uložení selhalo: " & FirstError.Message, NotificationType.Error))`.

### C.8 Jednorázová úprava výskytu (dlgOneTime) a volba rozsahu (dlgScope)

`dlgScope`: dvě karty – „Upravit pouze tento výskyt“ → `UpdateContext({locShowOneTime: true})`; „Upravit tento a
všechny následující“ → `Navigate(scrControlWizard, ScreenTransition.None, {locWizardMode: "edit", locControlId: locRun.ControlId, locEffectiveFrom: locRun.NominalDate, locStep: 4})`.

**btnSaveOneTime.OnSelect** (`overrideControlRun`):

```powerfx
If(
    IsBlank(Trim(txtOverrideReason.Text)),
    Notify("Důvod změny je povinný.", NotificationType.Error),
    dteDue.SelectedDate < dteScheduled.SelectedDate,
    Notify("Termín nesmí předcházet plánovanému datu.", NotificationType.Error),
    With(
        { fresh: LookUp(IC_ControlRuns, RunId = locRun.RunId), newOwner: Lower(cmbOverrideOwner.Selected.Mail) },
        Patch(IC_ControlRuns, fresh, {
            ScheduledDate: dteScheduled.SelectedDate,
            DueDate: dteDue.SelectedDate,
            DueMonthKey: Text(dteDue.SelectedDate, "yyyy-mm"),
            AssignedOwnerEmail: newOwner,
            OverrideNote: txtOverrideNote.Text,
            IsOneTimeOverride: true,
            ModifiedAt: Now(), ModifiedBy: varUserEmail, ModifiedSource: "App",
            RowVersion: fresh.RowVersion + 1
        });
        // Audit po polích – jen změněná
        If(fresh.DueDate <> dteDue.SelectedDate,
            Patch(IC_AuditLog, Defaults(IC_AuditLog), {AuditId: GUID(), EntityType: "ControlRun", EntityId: fresh.RunId, ControlId: fresh.ControlId,
                Action: "Jednorázová úprava výskytu", FieldName: "DueDate", OldValue: Text(fresh.DueDate, "yyyy-mm-dd"),
                NewValue: Text(dteDue.SelectedDate, "yyyy-mm-dd"), ChangedBy: varUserEmail, ChangedAt: Now(), ChangeReason: txtOverrideReason.Text}));
        If(Lower(fresh.AssignedOwnerEmail) <> newOwner,
            Patch(IC_AuditLog, Defaults(IC_AuditLog), {AuditId: GUID(), EntityType: "ControlRun", EntityId: fresh.RunId, ControlId: fresh.ControlId,
                Action: "Jednorázová úprava výskytu", FieldName: "AssignedOwnerEmail", OldValue: fresh.AssignedOwnerEmail,
                NewValue: newOwner, ChangedBy: varUserEmail, ChangedAt: Now(), ChangeReason: txtOverrideReason.Text}));
        UpdateContext({ locShowOneTime: false, locRun: LookUp(IC_ControlRuns, RunId = locRun.RunId) })
        // FLOW-06 zjistí změnu osoby/termínu přes „Get changes for an item“ a pošle upozornění.
    )
)
```

### C.9 Dashboard – KPI nad kolekcí (Filter, CountRows, With)

```powerfx
// Po načtení colPeriodRuns (C.2) a aplikaci filtrů
ClearCollect(
    colFiltered,
    Filter(
        colPeriodRuns,
        IsEmpty(cmbDepartment.SelectedItems) || Department in cmbDepartment.SelectedItems.Code,
        IsEmpty(cmbOwner.SelectedItems) || Lower(AssignedOwnerEmail) in ForAll(cmbOwner.SelectedItems, Lower(Mail)),
        IsEmpty(cmbRisk.SelectedItems) || RiskLevel in cmbRisk.SelectedItems.Code
    )
);
Set(
    varKpi,
    With(
        { P: Filter(colFiltered, WorkflowState <> "Cancelled") },
        With(
            {
                done:   Filter(P, WorkflowState = "Completed"),
                eval:   Filter(P, WorkflowState = "Completed" || DueDate < Today()),
                overdue: Filter(P, WorkflowState in ["Planned","InProgress","Returned"], DueDate < Today())
            },
            {
                Planned:   CountRows(P),
                Cancelled: CountRows(colFiltered) - CountRows(P),
                Completed: CountRows(done),
                OnTime:    CountRows(Filter(done, PerformedDate <= DueDate)),
                Overdue:   CountRows(overdue),
                Evaluable: CountRows(eval),
                OnTimeRate: If(CountRows(eval) = 0, Blank(), CountRows(Filter(done, PerformedDate <= DueDate)) / CountRows(eval))
            }
        )
    )
);
// lblKpiOnTime.Text
If(IsBlank(varKpi.OnTimeRate), "–", Text(varKpi.OnTimeRate, "0.0 %"))
```

Trend 6 měsíců (každý měsíc samostatný delegovatelný dotaz pod 2 000 položek):

```powerfx
Clear(colTrendRuns);
ForAll(
    Sequence(6, -5),          // -5 … 0
    Collect(
        colTrendRuns,
        Filter(IC_ControlRuns, DueMonthKey = Text(DateAdd(Today(), Value, TimeUnit.Months), "yyyy-mm"), IsSuperseded = false)
    )
);
ClearCollect(
    colTrend,
    ForAll(
        Sequence(6, -5),
        With(
            { mk: Text(DateAdd(Today(), Value, TimeUnit.Months), "yyyy-mm") },
            With(
                { P: Filter(colTrendRuns, DueMonthKey = mk, WorkflowState <> "Cancelled") },
                {
                    Month: mk,
                    OnTime: CountRows(Filter(P, WorkflowState = "Completed", PerformedDate <= DueDate)),
                    Late: CountRows(Filter(P, WorkflowState = "Completed", PerformedDate > DueDate)),
                    NotCompleted: CountRows(Filter(P, WorkflowState <> "Completed"))
                }
            )
        )
    )
);
// chtTrend.Items = colTrend; Series: OnTime, Late, NotCompleted; Labels: Month
```

### C.10 Přílohy (upload do knihovny)

Power Apps neumí přímo zapisovat soubory do knihovny dokumentů. Standardní postup bez premium:
1. Na obrazovku vložte formulář nad libovolným seznamem s přílohami (např. pomocný `IC_UploadBuffer`) a z něj
   ponechte jen ovládací prvek **Attachments** (`attUpload`).
2. `btnUpload.OnSelect` zavolá flow `FLOW-UploadEvidence` (trigger Power Apps V2 s parametrem typu **Soubor**):

```powerfx
ForAll(
    attUpload.Attachments,
    'FLOW-UploadEvidence'.Run(
        locRun.RunId, locRun.ControlCode, locRun.RunCode, drpEvidenceType.Selected.id, varUserEmail,
        { file: { contentBytes: ThisRecord.Value, name: ThisRecord.Name } }
    )
);
Reset(attUpload);
ClearCollect(colRunDocs, Filter(IC_ControlDocuments, RunId = locRun.RunId, IsRemoved = false))
```

Flow vytvoří složku `CTRL-xxxx/RUN-xxxx/Evidence` (akce „Create new folder“), soubor („Create file“), nastaví
metadata („Update file properties“: `DocumentId`, `RunId`, `EvidenceDefId`, `UploadedBy`…) a zapíše audit.
Stažení: `Launch(ThisItem.'Link to item')` nebo `Download(...)` z galerie nad `IC_ControlDocuments`.

### C.11 Volání Power Automate a zpracování výsledku

```powerfx
// Ruční doplnění výskytů jedné kontroly (FLOW-01, trigger Power Apps V2, odpověď „Respond to a PowerApp or flow“)
Set(varGen, 'FLOW-01-GenerateRecurringControls'.Run(locControl.ControlId, "Apply"));
If(
    varGen.status = "ok",
    Notify("Vygenerováno " & varGen.created & ", přeskočeno " & varGen.skipped & " existujících výskytů.", NotificationType.Success),
    Notify("Generování selhalo: " & varGen.message, NotificationType.Error)
);
// Náhled dopadu změny definice – flow vrací JSON jako text (pole impactjson)
Set(varImpact, 'FLOW-01-GenerateRecurringControls'.Run(locControl.ControlId, "Preview", JSON(locDraft, JSONFormat.Compact), Text(dteEffectiveFrom.SelectedDate, "yyyy-mm-dd")));
ClearCollect(
    colImpact,
    ForAll(Table(ParseJSON(varImpact.impactjson)),
        { action: Text(ThisRecord.Value.action), runCode: Text(ThisRecord.Value.runCode),
          oldDue: DateValue(Text(ThisRecord.Value.oldDue)), newDue: DateValue(Text(ThisRecord.Value.newDue)),
          note: Text(ThisRecord.Value.note) })
)
```

Flow volané z aplikace musí mít trigger **Power Apps (V2)** a pro návratové hodnoty akci **Respond to a PowerApp
or flow** (výstupy typu Text/Number). Názvy výstupů se v Power Fx zobrazují malými písmeny.

### C.12 Formulář zjištění (EditForm, SubmitForm, OnSuccess)

```powerfx
// frmFinding.DataSource = IC_Findings ; frmFinding.Item = Defaults(IC_Findings) nebo ThisItem
// Karty FindingId, FindingCode, RunId… mají Default:
//   FindingId: If(frmFinding.Mode = FormMode.New, GUID(), ThisItem.FindingId)
//   RunId: locRun.RunId ; ControlId: locRun.ControlId ; Department: locRun.Department
//   FindingCode: If(frmFinding.Mode = FormMode.New, "FND-" & Year(Today()) & "-" & Text(CountRows(colRunFindings)+1, "0000") & "-" & Left(GUID(), 4), ThisItem.FindingCode)
btnSaveFinding.OnSelect:  SubmitForm(frmFinding)
frmFinding.OnSuccess:
    Patch(IC_AuditLog, Defaults(IC_AuditLog), {
        AuditId: GUID(), EntityType: "Finding", EntityId: frmFinding.LastSubmit.FindingId, ControlId: locRun.ControlId,
        Action: If(frmFinding.Mode = FormMode.New, "Založení zjištění", "Úprava zjištění"),
        FieldName: "Status", NewValue: frmFinding.LastSubmit.Status, ChangedBy: varUserEmail, ChangedAt: Now()
    });
    ClearCollect(colRunFindings, Filter(IC_Findings, RunId = locRun.RunId));
    UpdateContext({ locShowFinding: false });
    Notify("Zjištění uloženo.", NotificationType.Success)
frmFinding.OnFailure:  Notify("Uložení selhalo: " & frmFinding.Error, NotificationType.Error)
```

Poznámka: sekvenční čísla (`FND-2026-0001`) bez Dataverse nelze přidělit atomicky. Proto přípona z GUID (unikátní)
nebo přidělení čísla ve flow (FLOW s concurrency 1).

### C.13 Kalendář (měsíční mřížka)

```powerfx
// scrCalendar.OnVisible
UpdateContext({ locMonth: Coalesce(locMonth, Date(Year(Today()), Month(Today()), 1)) });
UpdateContext({ locGridStart: DateAdd(locMonth, -(Weekday(locMonth, StartOfWeek.Monday) - 1), TimeUnit.Days) });
ClearCollect(colCalRuns,
    Filter(IC_ControlRuns, ScheduledDate >= locGridStart, ScheduledDate <= DateAdd(locGridStart, 41, TimeUnit.Days), IsSuperseded = false));
// galCalendarDays.Items (WrapCount = 7)
ForAll(Sequence(42, 0), { Day: DateAdd(locGridStart, Value, TimeUnit.Days) })
// v šabloně dne – galDayEvents.Items
FirstN(SortByColumns(Filter(colCalRuns, ScheduledDate = ThisItem.Day), "DueDate"), 3)
// lblCount.Text
CountRows(Filter(colCalRuns, ScheduledDate = ThisItem.Day))
```

Termín se z kalendáře nemění přetažením – kliknutí na událost otevře panel s tlačítkem „Změnit termín“ (dlgScope).

### C.14 SortByColumns, Filter a LookUp – přehled použití

| Účel | Vzorec | Delegace (SharePoint) |
|---|---|---|
| Detail podle GUID | `LookUp(IC_ControlRuns, RunId = locRunId)` | ✔ |
| Běhy kontroly | `Filter(IC_ControlRuns, ControlId = x)` | ✔ (indexovaný) |
| Měsíc | `Filter(IC_ControlRuns, DueMonthKey = "2026-11")` | ✔ |
| Rozsah dat | `Filter(IC_ControlRuns, DueDate >= a, DueDate <= b)` | ✔ |
| Řazení | `SortByColumns(…, "DueDate", SortOrder.Descending)` | ✔ (jeden sloupec) |
| Hledání prefixem | `StartsWith(ControlCode, "CTRL-00")` | ✔ |
| Fulltext | `Search(IC_Controls, txt, "Name")` | ✘ |
| `in` nad seznamem hodnot | `WorkflowState in [...]` | ✘ → rozepište `Or` nebo filtrujte kolekci |
| Funkce nad sloupcem | `Lower(AssignedOwnerEmail) = …`, `Year(DueDate) = 2026` | ✘ → ukládejte malými písmeny, používejte `DueMonthKey` |
| Agregace | `CountRows`, `Sum`, `Average` nad seznamem | ✘ → nad kolekcí (≤ 2 000) nebo ve flow |

---

## D. Delegace a objem dat (10 000–50 000 běhů)

**Limity:** nedelegovatelný dotaz zpracuje jen prvních *N* položek ze zdroje (výchozí 500, max. 2 000 –
Nastavení aplikace → „Limit počtu řádků dat“). Výsledek je pak **tiše neúplný** (Studio ukáže jen varování
o delegaci). Kolekce (`ClearCollect`) z delegovatelného dotazu obsahuje max. 2 000 položek.

| Dotaz | Riziko | Řešení |
|---|---|---|
| Dashboard nad všemi běhy | 50 000 položek → nelze načíst | dotaz po **měsících** přes indexovaný `DueMonthKey` (měsíc ≈ 300–600 běhů při 30 kontrolách, ≈ 1 500 při 100 kontrolách s denní frekvencí) |
| Měsíc s > 2 000 běhy (stovky denních kontrol) | kolekce se ořízne | rozdělit dotaz po útvarech (`DueMonthKey = x, Department = y`) nebo předpočítat agregace denním flow do `IC_ReportSnapshots` / pomocného seznamu `IC_DailyMetrics` |
| `CountRows(Filter(IC_ControlRuns, …))` | nedelegovatelné → max. 2 000 | počítat nad kolekcí nebo ve flow (`length(body('Get_items')?['value'])` s paginací) |
| „Po termínu“ přes celou historii | starší položky se nenačtou | `Filter(IC_ControlRuns, IsOpen = true, DueDate < Today())` – `IsOpen` + `DueDate` indexované, otevřených je řádově desítky |
| `WorkflowState in ["Planned","InProgress","Returned"]` | `in` nedelegovatelné | `Filter(IC_ControlRuns, IsOpen = true, …)` a jemné rozlišení až v kolekci |
| Vyhledávání v registru | `Search()` nedelegovatelné | `StartsWith` na `ControlCode`/`Name`; registr má stovky položek |
| Audit log | desítky tisíc | vždy filtr na `EntityId` / `ControlId` / `ChangedAt >= datum` (indexované), `SortByColumns` jen nad tímto výsledkem |
| Prahová hodnota 5 000 | dotaz bez indexu na seznamu > 5 000 selže | indexy založit předem (SHAREPOINT_SCHEMA), první podmínka filtru vždy na indexovaný sloupec |

Pravidlo pro návrh: **každá galerie nad velkým seznamem začíná delegovatelnou podmínkou na indexovaný sloupec
s výsledkem < 2 000**; nedelegovatelné jemné filtry až nad kolekcí.

---

## E. Postup implementace (krok za krokem)

1. **SharePoint web** – vytvořte komunikační/týmový web „Interní kontroly“ (nebo použijte přidělený). Vypněte
   sdílení s externími uživateli.
2. **Seznamy a knihovny** – založte seznamy A–M a knihovny dle SHAREPOINT_SCHEMA (nejprve interní anglické názvy
   sloupců, pak zobrazované české). Nastavte indexy, „Vynutit jedinečné hodnoty“, ověření sloupců a seznamů.
3. **Skupiny a oprávnění** – vytvořte skupiny IC Administrátoři/Koordinátoři/Uživatelé/Auditoři, vlastní úrovně
   „Pouze přidávat“ a „Přispívat bez odstraňování“, přerušte dědičnost u `IC_AuditLog`, `IC_Protocols`, `IC_Settings`.
4. **Počáteční data** – naplňte `IC_Lookups` (útvary s vedoucími, kategorie, priority, rizikovost, výsledky),
   `IC_Settings` (výchozí hodnoty), `IC_Holidays` (svátky na 2 roky), `IC_RoleAssignments`. Lze importem z CSV
   exportu demo aplikace (Administrace → Demo režim → Export JSON → převod).
5. **Power Automate** – vytvořte servisní účet (nebo sdílené připojení) a flow FLOW-01 až FLOW-07 dle
   POWER_AUTOMATE_FLOWS; nejprve FLOW-01 (generování) a FLOW-04 (protokol).
6. **Canvas aplikace** – Power Apps → Vytvořit → Prázdná aplikace na plátně, formát tablet (1366×768 nebo vlastní
   1440×900). Zapněte Nastavení → Aktualizace → **Moderní ovládací prvky a motivy**, **ParseJSON**; zvyšte limit řádků na 2 000.
7. **Datové zdroje** – přidejte SharePoint seznamy A–M (připojení pod uživatelem), **Office 365 Users**,
   **Office 365 Outlook** (jen pokud aplikace posílá poštu přímo – doporučeno nechat na flow) a flow.
8. **Motiv a komponenty** – barvy (navy `#0B1F3A`, primární `#1F5BD0`, teal `#0F9488`, plochy `#F5F7FA`),
   komponenty `cmpNavigation`, `cmpHeader`, `cmpKpiCard`, `cmpStatusBadge`.
9. **App.OnStart** – vzorec C.1; globální proměnné `varUserEmail`, `varActiveRole`, `varDeptScope`, `varCanManage`.
10. **Obrazovky** – v pořadí `scrMyControls` → `scrRunDetail` (provedení, schvalování) → `scrControlRegister` →
    `scrControlDetail` → `scrControlWizard` → `scrCalendar` → `scrDashboard` → `scrManagement` → `scrReports` →
    `scrNotifications` → `scrAdministration`. U každé obrazovky: kontejnery dle kap. A, vlastnosti `Items`,
    `OnSelect`, `DisplayMode`, `Visible` dle kap. C.
11. **Napojení flow** – `FLOW-01` (Power Apps V2) pro náhled/aplikaci změny definice a ruční generování,
    `FLOW-UploadEvidence` pro přílohy; ostatní flow běží na pozadí (plánované / trigger na položku).
12. **Testování** – scénáře v TEST_SCENARIOS.md, s důrazem na delegaci (testovací seznam s > 5 000 běhy),
    souběžnost (dva prohlížeče) a role (skutečné účty v různých skupinách).
13. **Publikace a zabezpečení** – sdílejte aplikaci jen se skupinami IC (ne „Všichni“), ověřte, že uživatel bez
    oprávnění k seznamu nevidí data ani přímo v SharePointu; nastavte DLP politiku prostředí (jen standardní
    konektory v jedné skupině „Business“); dokumentujte vlastníky flow a připojení.

---

## F. Zabezpečení – UI versus skutečná oprávnění

- `Visible`/`DisplayMode` podle `varActiveRole` je jen **uživatelský komfort**. Skutečná oprávnění vynucuje
  SharePoint (viz SHAREPOINT_SCHEMA kap. 7). Kdo má právo *Upravit* na seznamu, může data změnit i mimo aplikaci.
- Kritické kroky (protokol, report, generování běhů, změna oprávnění) provádí flow pod servisním účtem; uživatelé
  mají na `IC_Protocols`, `IC_ReportSnapshots`, `IC_Settings` jen čtení.
- Auditní log: „Pouze přidávat“; nikdo z uživatelů nesmí upravovat.
- Princip čtyř očí se kontroluje v aplikaci **i** ve FLOW-04 (protokol se nevytvoří, pokud `ApprovedBy = CompletedBy`;
  flow běh označí a upozorní administrátora).
- Item-level oprávnění jen výjimečně (limit 50 000 unikátních oprávnění na seznam, výkonnostní doporučení ≪ 5 000).

---

## G. Mapování datových operací (React repository → Power Platform)

| React (`src/services`, `src/data`) | Power Apps / Power Automate |
|---|---|
| `store.runs.get(id)` | `LookUp(IC_ControlRuns, RunId = id)` |
| `store.runs.filter(pred)` | `Filter(IC_ControlRuns, <delegovatelná podmínka>)` + kolekce |
| `store.runs.create(item)` | `Patch(IC_ControlRuns, Defaults(IC_ControlRuns), {...})` / flow „Create item“ |
| `store.runs.update(id, patch, {expectedRowVersion})` | vzor C.7 / flow „Send an HTTP request to SharePoint“ s `If-Match` |
| `store.runs.bulkPut(items)` | flow „Apply to each“ + „Create item“ (concurrency dle potřeby) |
| `store.audit.append(entry)` | `Patch(IC_AuditLog, Defaults(IC_AuditLog), {...})` |
| `createControl` | `scrControlWizard` → `Patch` IC_Controls + IC_ControlVersions → `FLOW-01.Run(id,"Apply")` |
| `previewDefinitionChange` | `FLOW-01.Run(id,"Preview",draftJson,effectiveFrom)` → `colImpact` |
| `applyDefinitionChange` | `FLOW-01.Run(id,"ApplyVersion",draftJson,effectiveFrom,reason)` |
| `generateOccurrences` | FLOW-01 (plánovaný denně + ruční) |
| `startRun / saveRunDraft / submitRun / approveRun / returnRun` | C.6 |
| `overrideRun` | C.8 |
| `cancelRun`, `reopenForCorrection` | `Patch` stavu + audit; oprava navíc FLOW-04 vytvoří novou verzi protokolu |
| `uploadRunDocument` / `removeDocument` | C.10 / `Patch` metadat (`IsRemoved`) přes flow |
| `createProtocolForRun` | FLOW-04 |
| `runDailyDeadlineCheck` | FLOW-02 + FLOW-03 |
| `retryFailedNotifications` | FLOW-07 |
| `generateMonthlyReport` | FLOW-05 |
| `exportData` / `importData` / `resetDemoData` | jen demo (v produkci zálohy SharePointu, export seznamů) |
