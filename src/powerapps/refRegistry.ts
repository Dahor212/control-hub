/**
 * Registr referencí „Power Apps Reference“. Jediný zdroj pro režim reference v UI
 * i pro tabulky v docs/SCREEN_MAP.md. Každá položka propojuje prvek React aplikace
 * s cílovou obrazovkou, ovládacím prvkem, SharePoint seznamem a Power Automate flow.
 */
export interface PaRefEntry {
  id: string;
  label: string;
  reactAction?: string;
  screen: string;
  control: string;
  list?: string;
  flow?: string;
  note?: string;
}

const e = (x: PaRefEntry) => x;

export const PA_REFS: Record<string, PaRefEntry> = Object.fromEntries(
  [
    // Navigace a rámec
    e({ id: 'nav.sidebar', label: 'Hlavní navigace', screen: 'cmpNavigation (komponenta)', control: 'galNavigation', note: 'Gallery nad kolekcí colNavItems, Visible podle rolí' }),
    e({ id: 'top.userSwitch', label: 'Přepínání demo uživatele', screen: '— (jen demo)', control: '—', list: 'IC_RoleAssignments', note: 'V produkci User().Email; role z IC_RoleAssignments v App.OnStart' }),
    e({ id: 'top.search', label: 'Globální vyhledávání', screen: 'cmpHeader', control: 'txtGlobalSearch + galSearchResults', list: 'IC_Controls, IC_ControlRuns', note: 'StartsWith(ControlCode, …) – delegovatelné' }),
    e({ id: 'top.bell', label: 'Upozornění uživatele', screen: 'cmpHeader', control: 'icoBell + lblUnreadCount', list: 'IC_Notifications' }),
    // Dashboard
    e({ id: 'dash.filters', label: 'Filtry dashboardu', reactAction: 'filterRuns', screen: 'scrDashboard', control: 'drpPeriod, cmbDepartment, cmbOwner, cmbState, cmbFrequency, cmbCategory, cmbRisk, btnResetFilters', list: 'IC_ControlRuns', note: 'Delegovatelný dotaz po měsících (DueMonthKey) + filtr v kolekci' }),
    e({ id: 'dash.kpi', label: 'KPI karta', reactAction: 'computeKpis', screen: 'scrDashboard', control: 'conKpiPlanned … conKpiPending (Container + Label)', list: 'IC_ControlRuns', note: 'OnSelect: Navigate(scrRunList, …, {locPreset: "overdue"})' }),
    e({ id: 'dash.trend', label: 'Trend plnění 6 měsíců', reactAction: 'monthlyTrend', screen: 'scrDashboard', control: 'chtTrend (Column chart)', list: 'IC_ControlRuns / IC_ReportSnapshots' }),
    e({ id: 'dash.status', label: 'Rozdělení podle stavů', reactAction: 'statusDistribution', screen: 'scrDashboard', control: 'chtStatus (Pie chart)', list: 'IC_ControlRuns' }),
    e({ id: 'dash.dept', label: 'Plnění podle útvarů', reactAction: 'groupKpis', screen: 'scrDashboard', control: 'chtDepartments (Bar chart)', list: 'IC_ControlRuns' }),
    e({ id: 'dash.viewToggle', label: 'Přepínač Můj pohled / Tým', screen: 'scrDashboard', control: 'tglTeamView', note: 'Jen pro roli Manager' }),
    // Moje kontroly
    e({ id: 'my.tabs', label: 'Záložky Moje kontroly', reactAction: 'myRunBuckets', screen: 'scrMyControls', control: 'tabMyControls + galMyRuns', list: 'IC_ControlRuns', note: 'Filter(IC_ControlRuns, AssignedOwnerEmail = varUserEmail, IsOpen = true)' }),
    e({ id: 'my.action', label: 'Akce běhu v seznamu', screen: 'scrMyControls', control: 'btnRunAction (v galMyRuns)', note: 'Navigate(scrRunDetail, …, {locRunId: ThisItem.RunId})' }),
    // Registr
    e({ id: 'reg.table', label: 'Registr kontrol', screen: 'scrControlRegister', control: 'galControls (Gallery) / tblControls', list: 'IC_Controls' }),
    e({ id: 'reg.search', label: 'Vyhledávání v registru', screen: 'scrControlRegister', control: 'txtSearch', list: 'IC_Controls', note: 'StartsWith(ControlCode/Name) delegovatelné; Search() nad SharePointem delegovatelné není' }),
    e({ id: 'reg.new', label: 'Nová kontrola', reactAction: 'createControl', screen: 'scrControlWizard', control: 'btnNewControl', list: 'IC_Controls, IC_ControlVersions, IC_ControlRuns', flow: 'FLOW-01 (Power Apps V2 trigger), FLOW-06' }),
    e({ id: 'reg.export', label: 'Export CSV', screen: 'scrControlRegister', control: 'btnExportCsv', note: 'Power Apps: Power Automate „Create CSV table“ → OneDrive / e-mail' }),
    // Průvodce
    e({ id: 'wiz.steps', label: 'Průvodce založením kontroly', screen: 'scrControlWizard', control: 'galWizardSteps + conStep1…7', note: 'locStep (číslo kroku), validace v btnNext.DisplayMode' }),
    e({ id: 'wiz.preview', label: 'Náhled výskytů', reactAction: 'previewOccurrences', screen: 'scrControlWizard', control: 'galOccurrencePreview', note: 'Výpočet jen pro náhled (ForAll + Sequence); závazné generování provádí FLOW-01' }),
    e({ id: 'wiz.save', label: 'Uložit kontrolu', reactAction: 'createControl', screen: 'scrControlWizard', control: 'btnSaveControl', list: 'IC_Controls, IC_ControlVersions', flow: 'FLOW-01, FLOW-06' }),
    e({ id: 'wiz.impact', label: 'Náhled dopadu změny', reactAction: 'previewDefinitionChange', screen: 'scrControlWizard', control: 'galImpactPreview + chkConfirmImpact', list: 'IC_ControlRuns', flow: 'FLOW-01 (režim Preview)' }),
    e({ id: 'wiz.applyChange', label: 'Uložit novou verzi', reactAction: 'changeControlDefinition', screen: 'scrControlWizard', control: 'btnApplyVersion', list: 'IC_ControlVersions, IC_ControlRuns, IC_AuditLog', flow: 'FLOW-01 (režim Apply)' }),
    // Detail kontroly
    e({ id: 'ctl.header', label: 'Hlavička definice kontroly', screen: 'scrControlDetail', control: 'conControlHeader', list: 'IC_Controls' }),
    e({ id: 'ctl.edit', label: 'Upravit definici', reactAction: 'changeControlDefinition', screen: 'scrControlWizard', control: 'btnEditDefinition', list: 'IC_ControlVersions' }),
    e({ id: 'ctl.archive', label: 'Archivovat kontrolu', reactAction: 'archiveControl', screen: 'scrControlDetail', control: 'btnArchive + dlgArchive', list: 'IC_Controls, IC_ControlRuns' }),
    e({ id: 'ctl.generate', label: 'Vygenerovat výskyty', reactAction: 'generateOccurrences', screen: 'scrControlDetail', control: 'btnGenerate', flow: 'FLOW-01' }),
    e({ id: 'ctl.versions', label: 'Historie verzí', screen: 'scrControlDetail', control: 'galVersions', list: 'IC_ControlVersions' }),
    e({ id: 'ctl.runs', label: 'Historie běhů', screen: 'scrControlDetail', control: 'galControlRuns', list: 'IC_ControlRuns', note: 'Filter(IC_ControlRuns, ControlId = locControl.ControlId) – ControlId indexovaný' }),
    // Detail běhu
    e({ id: 'run.header', label: 'Hlavička běhu', screen: 'scrRunDetail', control: 'conRunHeader', list: 'IC_ControlRuns' }),
    e({ id: 'run.edit', label: 'Změnit termín / odpovědnost', reactAction: 'overrideControlRun | changeControlDefinition', screen: 'scrRunDetail', control: 'btnReschedule + dlgScope', list: 'IC_ControlRuns', flow: 'FLOW-06' }),
    e({ id: 'run.start', label: 'Zahájit provedení', reactAction: 'startControlRun', screen: 'scrRunDetail', control: 'btnStartRun', list: 'IC_ControlRuns' }),
    e({ id: 'run.checklist', label: 'Checklist provedení', reactAction: 'saveControlRunDraft', screen: 'scrRunDetail', control: 'galChecklist (radChecklistAnswer, txtChecklistComment)', list: 'IC_ControlRuns.ChecklistResults (JSON)' }),
    e({ id: 'run.result', label: 'Celkový výsledek', screen: 'scrRunDetail', control: 'drpResult + txtResultComment', list: 'IC_ControlRuns' }),
    e({ id: 'run.save', label: 'Uložit rozpracované', reactAction: 'saveControlRunDraft', screen: 'scrRunDetail', control: 'btnSaveDraft', list: 'IC_ControlRuns' }),
    e({ id: 'run.submit', label: 'Dokončit / odeslat ke schválení', reactAction: 'completeControlRun / submitControlRun', screen: 'scrRunDetail', control: 'btnCompleteControl', list: 'IC_ControlRuns', flow: 'FLOW-04 (dokončení), FLOW-06 (schvalovatel)' }),
    e({ id: 'run.approve', label: 'Schválit', reactAction: 'approveControlRun', screen: 'scrRunDetail', control: 'btnApprove', list: 'IC_ControlRuns', flow: 'FLOW-04' }),
    e({ id: 'run.return', label: 'Vrátit k doplnění', reactAction: 'returnControlRun', screen: 'scrRunDetail', control: 'btnReturn + txtReturnComment', list: 'IC_ControlRuns', flow: 'FLOW-06' }),
    e({ id: 'run.cancel', label: 'Zrušit běh', reactAction: 'cancelControlRun', screen: 'scrRunDetail', control: 'btnCancelRun', list: 'IC_ControlRuns' }),
    e({ id: 'run.correct', label: 'Řízená oprava', reactAction: 'reopenControlRunForCorrection', screen: 'scrRunDetail', control: 'btnCorrection', list: 'IC_ControlRuns, IC_Protocols', flow: 'FLOW-04' }),
    e({ id: 'run.attachments', label: 'Přílohy běhu', reactAction: 'uploadRunDocument', screen: 'scrRunDetail', control: 'galRunDocuments + btnUpload (Attachments control → flow)', list: 'IC_ControlDocuments', note: 'Upload přes Power Automate „Create file“ do složky CTRL-xxxx/RUN-xxxx/Evidence' }),
    e({ id: 'run.findings', label: 'Nápravná opatření', reactAction: 'createFinding', screen: 'scrRunDetail', control: 'galFindings + frmFinding', list: 'IC_Findings' }),
    e({ id: 'run.protocols', label: 'Protokoly běhu', reactAction: 'createProtocolForRun', screen: 'scrRunDetail', control: 'galProtocols + btnDownloadProtocol', list: 'IC_Protocols, IC_ControlDocuments', flow: 'FLOW-04' }),
    // Kalendář
    e({ id: 'cal.view', label: 'Kalendář běhů', screen: 'scrCalendar', control: 'galCalendarDays (Sequence(42)) + galDayEvents', list: 'IC_ControlRuns', note: 'Filter(IC_ControlRuns, DueDate >= locFrom, DueDate <= locTo) – delegovatelné' }),
    e({ id: 'cal.event', label: 'Detail události', screen: 'scrCalendar', control: 'conEventPanel', list: 'IC_ControlRuns' }),
    // Management
    e({ id: 'mgmt.metrics', label: 'Manažerské metriky', reactAction: 'computeKpis', screen: 'scrManagement', control: 'galMetrics', list: 'IC_ControlRuns, IC_Findings', note: 'Agregace nad měsíční kolekcí; pro velké objemy denní snapshot z flow' }),
    e({ id: 'mgmt.owners', label: 'Tabulka odpovědných osob', reactAction: 'groupKpis', screen: 'scrManagement', control: 'galOwners', list: 'IC_ControlRuns' }),
    e({ id: 'mgmt.problems', label: 'TOP problematické kontroly', reactAction: 'problemControls', screen: 'scrManagement', control: 'galProblemControls', list: 'IC_ControlRuns' }),
    // Reporty
    e({ id: 'rep.generate', label: 'Vygenerovat měsíční report', reactAction: 'generateMonthlyReport', screen: 'scrReports', control: 'btnGenerateReport', list: 'IC_ReportSnapshots, IC_ManagementReports', flow: 'FLOW-05' }),
    e({ id: 'rep.archive', label: 'Archiv reportů', screen: 'scrReports', control: 'galReports + btnDownloadReport', list: 'IC_ReportSnapshots' }),
    // Upozornění
    e({ id: 'ntf.simulate', label: 'Simulovat denní kontrolu termínů', reactAction: 'runDailyDeadlineCheck', screen: 'scrNotifications', control: 'btnSimulateDaily', list: 'IC_Notifications', flow: 'FLOW-02, FLOW-03', note: 'V produkci plánovaný běh – tlačítko pouze pro test' }),
    e({ id: 'ntf.retry', label: 'Zopakovat neúspěšná odeslání', reactAction: 'retryFailedNotifications', screen: 'scrNotifications', control: 'btnRetryFailed', list: 'IC_Notifications', flow: 'FLOW-07' }),
    e({ id: 'ntf.log', label: 'Log upozornění', screen: 'scrNotifications', control: 'galNotificationLog', list: 'IC_Notifications' }),
    // Administrace
    e({ id: 'adm.roles', label: 'Uživatelé a role', reactAction: 'saveRoleAssignment', screen: 'scrAdministration', control: 'galRoleAssignments + frmRole', list: 'IC_RoleAssignments' }),
    e({ id: 'adm.lookups', label: 'Číselníky', reactAction: 'saveLookup', screen: 'scrAdministration', control: 'galLookups + frmLookup', list: 'IC_Lookups' }),
    e({ id: 'adm.rules', label: 'Pravidla upozornění', reactAction: 'updateSettings', screen: 'scrAdministration', control: 'frmNotificationRules', list: 'IC_Settings' }),
    e({ id: 'adm.audit', label: 'Auditní log', screen: 'scrAdministration', control: 'galAuditLog + filtry', list: 'IC_AuditLog', note: 'Filtr ChangedAt >= datum – delegovatelné; indexovat ChangedAt, EntityId, ControlId' }),
    e({ id: 'adm.tech', label: 'Technický stav', screen: 'scrAdministration', control: 'galAutomationLog', list: 'IC_AutomationLog', flow: 'FLOW-07' }),
    e({ id: 'adm.demo', label: 'Demo režim', screen: '— (jen demo)', control: '—', note: 'Testovací datum v produkci neexistuje – zdrojem je Now() / utcNow() flow' }),
  ].map((x) => [x.id, x]),
);
