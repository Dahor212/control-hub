# SCREEN_MAP – inventář obrazovek a komponent

Tabulky propojují React implementaci (`src/ui/pages/*`) s cílovými obrazovkami a ovládacími prvky Power Apps.
Část „Referenční ID“ je **vygenerována z `src/powerapps/refRegistry.ts`** – stejný registr používá v aplikaci režim
**Power Apps Reference** (přepínač v horní liště / Administrace → Demo režim). Po zapnutí se u prvků zobrazí štítek
„PA“ a po kliknutí přesně tato data.

## 1. Obrazovky

| # | React stránka (soubor) | Route | Power Apps | Role s přístupem | Klíčové prvky |
|---|---|---|---|---|---|
| 1 | Dashboard (`DashboardPage.tsx`) | `/` | `scrDashboard` | všechny (rozsah dle role) | filtry, 6 KPI, trend, stavy, útvary, nejrizikovější, dnešní úkoly, 7 dní, po termínu, dokončené, nedávné změny; Manažer: přepínač Můj pohled / Tým |
| 2 | Moje kontroly (`MyControlsPage.tsx`) | `/my` | `scrMyControls` | kromě Auditora | záložky K provedení, Dnes, Blížící se, Po termínu, Rozpracované, Čekající na schválení, Vrácené, Dokončené, Naplánované, (Ke schválení) |
| 3 | Registr kontrol (`RegisterPage.tsx`) | `/controls` | `scrControlRegister` | všechny (správa jen Koordinátor/Admin) | vyhledávání, filtry, tabulka/karty, export CSV, nová kontrola |
| 4 | Detail kontroly (`ControlDetailPage.tsx`) | `/controls/:id` | `scrControlDetail` | všechny | záložky Přehled, Historie běhů, Verze (rozdíly), Přílohy, Nápravná opatření, Protokoly, Auditní historie; Upravit definici, Vygenerovat výskyty, Archivovat/Reaktivovat |
| 5 | Průvodce (`dialogs/ControlWizard.tsx`) | dialog | `scrControlWizard` | Koordinátor, Admin | 7 kroků; v režimu úprav krok „Účinnost a náhled dopadu“ |
| 6 | Detail běhu (`RunDetailPage.tsx`) | `/runs/:id` | `scrRunDetail` | dle rozsahu | záložky Přehled, Provedení, Přílohy, Nápravná opatření, Protokoly, Auditní historie; Změnit termín/odpovědnost, Zrušit, Řízená oprava |
| 7 | Seznam běhů (`RunsListPage.tsx`) | `/runs?view=` | `scrRunList` | dle rozsahu | proklik z KPI, výběr pohledu, export CSV |
| 8 | Zjištění (`FindingsPage.tsx`) | `/findings` | `scrFindings` | dle rozsahu | otevřená / po termínu / uzavřená, export |
| 9 | Kalendář (`CalendarPage.tsx`) | `/calendar` | `scrCalendar` | všechny | měsíc / týden / seznam, plánované datum vs. termín, filtry, svátky, panel události, změna termínu s volbou rozsahu |
| 10 | Manažerský přehled (`ManagementPage.tsx`) | `/management` | `scrManagement` | Admin, Koordinátor, Manažer, Auditor | 7 metrik, porovnání útvarů, vývoj 12 měsíců, odpovědné osoby, rizikovost, TOP problémy, trend zjištění, definice |
| 11 | Reporty (`ReportsPage.tsx`) | `/reports` | `scrReports` | Admin, Koordinátor, Manažer, Auditor | archiv snapshotů, vygenerovat, náhled, PDF, ověření integrity |
| 12 | Upozornění (`NotificationsPage.tsx`) | `/notifications` | `scrNotifications` | všechny (evidence a simulace dle role) | moje upozornění, evidence, simulace denní kontroly, opakování doručení |
| 13 | Administrace (`AdminPage.tsx`) | `/admin` | `scrAdministration` | Admin (Koordinátor/Auditor: audit, technický stav) | role, číselníky, pravidla upozornění, opakování a svátky, auditní log, technický stav, demo režim |

## 2. Sdílené komponenty

| React komponenta | Soubor | Power Apps | Poznámka |
|---|---|---|---|
| `AppShell` (menu + horní lišta) | `layout/AppShell.tsx` | `cmpNavigation`, `cmpHeader` | menu dle role |
| `Button`, `Badge`, `Card`, `Field`, `Input`, `Select`, `Tabs`, `Segmented`, `Notice` | `components/ui.tsx` | Button, Label, Container, TextInput, Dropdown, Tab list | design systém |
| `DataTable` | `components/DataTable.tsx` | Gallery + `SortByColumns` | stránkování řeší Power Apps posuvem |
| `RunTable` | `components/RunTable.tsx` | `galRuns` (šablona řádku) | export CSV → flow |
| `FilterBar`, `MultiSelect` | `components/FilterBar.tsx`, `Popover.tsx` | ComboBox (`SelectMultiple`) | |
| `UserPicker` | `components/Popover.tsx` | ComboBox + `Office365Users.SearchUserV2` | |
| `Dialog`, `ConfirmDialog` | `components/Dialog.tsx` | kontejner-překryv, `Visible` | potvrzení s povinným důvodem |
| `StatusBadges` | `components/StatusBadges.tsx` | `cmpStatusBadge` | barva + ikona + text |
| `Charts` (StackedBars, Donut, RateBars, RateLines) | `components/Charts.tsx` | Column / Pie / Line chart, galerie pruhů | |
| `AuditTable` | `components/AuditTable.tsx` | `galAudit` | |
| `PaRef` | `components/PaRef.tsx` | – | jen prototyp |
| `ProtocolPreview`, `ReportPreview` | `dialogs/SnapshotPreviews.tsx` | odkaz na PDF v knihovně (`Launch`) | |
| `RunEditDialog`, `FindingDialog` | `dialogs/RunDialogs.tsx` | `dlgScope`, `dlgOneTime`, `frmFinding` | |

## 3. Referenční ID prvků (z registru)

| Ref ID | Prvek | React akce | Power Apps obrazovka | Power Apps control | SharePoint zdroj | Power Automate | Poznámka |
|---|---|---|---|---|---|---|---|
| `nav.sidebar` | Hlavní navigace | – | cmpNavigation (komponenta) | galNavigation | – | – | Gallery nad kolekcí colNavItems, Visible podle rolí |
| `top.userSwitch` | Přepínání demo uživatele | – | — (jen demo) | — | IC_RoleAssignments | – | V produkci User().Email; role z IC_RoleAssignments v App.OnStart |
| `top.search` | Globální vyhledávání | – | cmpHeader | txtGlobalSearch + galSearchResults | IC_Controls, IC_ControlRuns | – | StartsWith(ControlCode, …) – delegovatelné |
| `top.bell` | Upozornění uživatele | – | cmpHeader | icoBell + lblUnreadCount | IC_Notifications | – | – |
| `dash.filters` | Filtry dashboardu | `filterRuns` | scrDashboard | drpPeriod, cmbDepartment, cmbOwner, cmbState, cmbFrequency, cmbCategory, cmbRisk, btnResetFilters | IC_ControlRuns | – | Delegovatelný dotaz po měsících (DueMonthKey) + filtr v kolekci |
| `dash.kpi` | KPI karta | `computeKpis` | scrDashboard | conKpiPlanned … conKpiPending (Container + Label) | IC_ControlRuns | – | – |
| `dash.trend` | Trend plnění 6 měsíců | `monthlyTrend` | scrDashboard | chtTrend (Column chart) | IC_ControlRuns / IC_ReportSnapshots | – | – |
| `dash.status` | Rozdělení podle stavů | `statusDistribution` | scrDashboard | chtStatus (Pie chart) | IC_ControlRuns | – | – |
| `dash.dept` | Plnění podle útvarů | `groupKpis` | scrDashboard | chtDepartments (Bar chart) | IC_ControlRuns | – | – |
| `dash.viewToggle` | Přepínač Můj pohled / Tým | – | scrDashboard | tglTeamView | – | – | Jen pro roli Manager |
| `my.tabs` | Záložky Moje kontroly | `myRunBuckets` | scrMyControls | tabMyControls + galMyRuns | IC_ControlRuns | – | Filter(IC_ControlRuns, AssignedOwnerEmail = varUserEmail, IsOpen = true) |
| `my.action` | Akce běhu v seznamu | – | scrMyControls | btnRunAction (v galMyRuns) | – | – | – |
| `reg.table` | Registr kontrol | – | scrControlRegister | galControls (Gallery) / tblControls | IC_Controls | – | – |
| `reg.search` | Vyhledávání v registru | – | scrControlRegister | txtSearch | IC_Controls | – | StartsWith(ControlCode/Name) delegovatelné; Search() nad SharePointem delegovatelné není |
| `reg.new` | Nová kontrola | `createControl` | scrControlWizard | btnNewControl | IC_Controls, IC_ControlVersions, IC_ControlRuns | FLOW-01 (Power Apps V2 trigger), FLOW-06 | – |
| `reg.export` | Export CSV | – | scrControlRegister | btnExportCsv | – | – | Power Apps: Power Automate „Create CSV table“ → OneDrive / e-mail |
| `wiz.steps` | Průvodce založením kontroly | – | scrControlWizard | galWizardSteps + conStep1…7 | – | – | locStep (číslo kroku), validace v btnNext.DisplayMode |
| `wiz.preview` | Náhled výskytů | `previewOccurrences` | scrControlWizard | galOccurrencePreview | – | – | Výpočet jen pro náhled (ForAll + Sequence); závazné generování provádí FLOW-01 |
| `wiz.save` | Uložit kontrolu | `createControl` | scrControlWizard | btnSaveControl | IC_Controls, IC_ControlVersions | FLOW-01, FLOW-06 | – |
| `wiz.impact` | Náhled dopadu změny | `previewDefinitionChange` | scrControlWizard | galImpactPreview + chkConfirmImpact | IC_ControlRuns | FLOW-01 (režim Preview) | – |
| `wiz.applyChange` | Uložit novou verzi | `changeControlDefinition` | scrControlWizard | btnApplyVersion | IC_ControlVersions, IC_ControlRuns, IC_AuditLog | FLOW-01 (režim Apply) | – |
| `ctl.header` | Hlavička definice kontroly | – | scrControlDetail | conControlHeader | IC_Controls | – | – |
| `ctl.edit` | Upravit definici | `changeControlDefinition` | scrControlWizard | btnEditDefinition | IC_ControlVersions | – | – |
| `ctl.archive` | Archivovat kontrolu | `archiveControl` | scrControlDetail | btnArchive + dlgArchive | IC_Controls, IC_ControlRuns | – | – |
| `ctl.generate` | Vygenerovat výskyty | `generateOccurrences` | scrControlDetail | btnGenerate | – | FLOW-01 | – |
| `ctl.versions` | Historie verzí | – | scrControlDetail | galVersions | IC_ControlVersions | – | – |
| `ctl.runs` | Historie běhů | – | scrControlDetail | galControlRuns | IC_ControlRuns | – | Filter(IC_ControlRuns, ControlId = locControl.ControlId) – ControlId indexovaný |
| `run.header` | Hlavička běhu | – | scrRunDetail | conRunHeader | IC_ControlRuns | – | – |
| `run.edit` | Změnit termín / odpovědnost | `overrideControlRun | changeControlDefinition` | scrRunDetail | btnReschedule + dlgScope | IC_ControlRuns | FLOW-06 | – |
| `run.start` | Zahájit provedení | `startControlRun` | scrRunDetail | btnStartRun | IC_ControlRuns | – | – |
| `run.checklist` | Checklist provedení | `saveControlRunDraft` | scrRunDetail | galChecklist (radChecklistAnswer, txtChecklistComment) | IC_ControlRuns.ChecklistResults (JSON) | – | – |
| `run.result` | Celkový výsledek | – | scrRunDetail | drpResult + txtResultComment | IC_ControlRuns | – | – |
| `run.save` | Uložit rozpracované | `saveControlRunDraft` | scrRunDetail | btnSaveDraft | IC_ControlRuns | – | – |
| `run.submit` | Dokončit / odeslat ke schválení | `completeControlRun / submitControlRun` | scrRunDetail | btnCompleteControl | IC_ControlRuns | FLOW-04 (dokončení), FLOW-06 (schvalovatel) | – |
| `run.approve` | Schválit | `approveControlRun` | scrRunDetail | btnApprove | IC_ControlRuns | FLOW-04 | – |
| `run.return` | Vrátit k doplnění | `returnControlRun` | scrRunDetail | btnReturn + txtReturnComment | IC_ControlRuns | FLOW-06 | – |
| `run.cancel` | Zrušit běh | `cancelControlRun` | scrRunDetail | btnCancelRun | IC_ControlRuns | – | – |
| `run.correct` | Řízená oprava | `reopenControlRunForCorrection` | scrRunDetail | btnCorrection | IC_ControlRuns, IC_Protocols | FLOW-04 | – |
| `run.attachments` | Přílohy běhu | `uploadRunDocument` | scrRunDetail | galRunDocuments + btnUpload (Attachments control → flow) | IC_ControlDocuments | – | Upload přes Power Automate „Create file“ do složky CTRL-xxxx/RUN-xxxx/Evidence |
| `run.findings` | Nápravná opatření | `createFinding` | scrRunDetail | galFindings + frmFinding | IC_Findings | – | – |
| `run.protocols` | Protokoly běhu | `createProtocolForRun` | scrRunDetail | galProtocols + btnDownloadProtocol | IC_Protocols, IC_ControlDocuments | FLOW-04 | – |
| `cal.view` | Kalendář běhů | – | scrCalendar | galCalendarDays (Sequence(42)) + galDayEvents | IC_ControlRuns | – | Filter(IC_ControlRuns, DueDate >= locFrom, DueDate <= locTo) – delegovatelné |
| `cal.event` | Detail události | – | scrCalendar | conEventPanel | IC_ControlRuns | – | – |
| `mgmt.metrics` | Manažerské metriky | `computeKpis` | scrManagement | galMetrics | IC_ControlRuns, IC_Findings | – | Agregace nad měsíční kolekcí; pro velké objemy denní snapshot z flow |
| `mgmt.owners` | Tabulka odpovědných osob | `groupKpis` | scrManagement | galOwners | IC_ControlRuns | – | – |
| `mgmt.problems` | TOP problematické kontroly | `problemControls` | scrManagement | galProblemControls | IC_ControlRuns | – | – |
| `rep.generate` | Vygenerovat měsíční report | `generateMonthlyReport` | scrReports | btnGenerateReport | IC_ReportSnapshots, IC_ManagementReports | FLOW-05 | – |
| `rep.archive` | Archiv reportů | – | scrReports | galReports + btnDownloadReport | IC_ReportSnapshots | – | – |
| `ntf.simulate` | Simulovat denní kontrolu termínů | `runDailyDeadlineCheck` | scrNotifications | btnSimulateDaily | IC_Notifications | FLOW-02, FLOW-03 | V produkci plánovaný běh – tlačítko pouze pro test |
| `ntf.retry` | Zopakovat neúspěšná odeslání | `retryFailedNotifications` | scrNotifications | btnRetryFailed | IC_Notifications | FLOW-07 | – |
| `ntf.log` | Log upozornění | – | scrNotifications | galNotificationLog | IC_Notifications | – | – |
| `adm.roles` | Uživatelé a role | `saveRoleAssignment` | scrAdministration | galRoleAssignments + frmRole | IC_RoleAssignments | – | – |
| `adm.lookups` | Číselníky | `saveLookup` | scrAdministration | galLookups + frmLookup | IC_Lookups | – | – |
| `adm.rules` | Pravidla upozornění | `updateSettings` | scrAdministration | frmNotificationRules | IC_Settings | – | – |
| `adm.audit` | Auditní log | – | scrAdministration | galAuditLog + filtry | IC_AuditLog | – | Filtr ChangedAt >= datum – delegovatelné; indexovat ChangedAt, EntityId, ControlId |
| `adm.tech` | Technický stav | – | scrAdministration | galAutomationLog | IC_AutomationLog | FLOW-07 | – |
| `adm.demo` | Demo režim | – | — (jen demo) | — | – | – | Testovací datum v produkci neexistuje – zdrojem je Now() / utcNow() flow |
