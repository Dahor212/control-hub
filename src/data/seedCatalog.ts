/**
 * Syntetický katalog demo dat. Žádná skutečná osobní, klientská ani firemní data.
 * Příklady kontrol slouží jen jako ilustrace – nejde o tvrzení o zákonných povinnostech.
 */
import type { DirectoryUser, LookupItem, RecurrenceType, RiskLevel, Priority, MonthlyMode, PeriodMode, DueUnit, RoleName } from '../domain/types';

const D = '@ic-demo.example';
export const U = {
  admin: `michal.benes${D}`,
  coord: `katerina.markova${D}`,
  director: `eva.vesela${D}`,
  headPRI: `petr.svoboda${D}`,
  headPLA: `lucie.dvorakova${D}`,
  headKLI: `martin.cerny${D}`,
  headDAV: `tereza.prochazkova${D}`,
  headDAT: `tomas.kucera${D}`,
  jana: `jana.novakova${D}`,
  jakub: `jakub.horak${D}`,
  barbora: `barbora.kralova${D}`,
  ondrej: `ondrej.pokorny${D}`,
  veronika: `veronika.nemcova${D}`,
  filip: `filip.zeman${D}`,
  alena: `alena.ruzickova${D}`,
};

export const DIRECTORY: DirectoryUser[] = [
  { Email: U.admin, DisplayName: 'Michal Beneš', JobTitle: 'Správce aplikace', Department: 'DAT', ManagerEmail: U.headDAT, Initials: 'MB' },
  { Email: U.coord, DisplayName: 'Kateřina Marková', JobTitle: 'Koordinátorka interních kontrol', Department: 'DAT', ManagerEmail: U.director, Initials: 'KM' },
  { Email: U.director, DisplayName: 'Eva Veselá', JobTitle: 'Ředitelka backoffice', Department: 'DAT', ManagerEmail: null, Initials: 'EV' },
  { Email: U.headPRI, DisplayName: 'Petr Svoboda', JobTitle: 'Vedoucí zpracování příspěvků', Department: 'PRI', ManagerEmail: U.director, Initials: 'PS' },
  { Email: U.headPLA, DisplayName: 'Lucie Dvořáková', JobTitle: 'Vedoucí plateb a vypořádání', Department: 'PLA', ManagerEmail: U.director, Initials: 'LD' },
  { Email: U.headKLI, DisplayName: 'Martin Černý', JobTitle: 'Vedoucí klientských požadavků', Department: 'KLI', ManagerEmail: U.director, Initials: 'MČ' },
  { Email: U.headDAV, DisplayName: 'Tereza Procházková', JobTitle: 'Vedoucí výplat dávek', Department: 'DAV', ManagerEmail: U.director, Initials: 'TP' },
  { Email: U.headDAT, DisplayName: 'Tomáš Kučera', JobTitle: 'Vedoucí dat a reportingu', Department: 'DAT', ManagerEmail: U.director, Initials: 'TK' },
  { Email: U.jana, DisplayName: 'Jana Nováková', JobTitle: 'Specialistka zpracování příspěvků', Department: 'PRI', ManagerEmail: U.headPRI, Initials: 'JN' },
  { Email: U.jakub, DisplayName: 'Jakub Horák', JobTitle: 'Specialista plateb', Department: 'PLA', ManagerEmail: U.headPLA, Initials: 'JH' },
  { Email: U.barbora, DisplayName: 'Barbora Králová', JobTitle: 'Specialistka klientských požadavků', Department: 'KLI', ManagerEmail: U.headKLI, Initials: 'BK' },
  { Email: U.ondrej, DisplayName: 'Ondřej Pokorný', JobTitle: 'Specialista výplat dávek', Department: 'DAV', ManagerEmail: U.headDAV, Initials: 'OP' },
  { Email: U.veronika, DisplayName: 'Veronika Němcová', JobTitle: 'Datová analytička', Department: 'DAT', ManagerEmail: U.headDAT, Initials: 'VN' },
  { Email: U.filip, DisplayName: 'Filip Zeman', JobTitle: 'Specialista vypořádání', Department: 'PLA', ManagerEmail: U.headPLA, Initials: 'FZ' },
  { Email: U.alena, DisplayName: 'Alena Růžičková', JobTitle: 'Interní auditorka', Department: 'DAT', ManagerEmail: U.director, Initials: 'AR' },
];

export const ROLE_SEED: Array<[string, RoleName, string]> = [
  [U.admin, 'Administrator', 'ALL'],
  [U.coord, 'Coordinator', 'ALL'],
  [U.director, 'Manager', 'ALL'],
  [U.headPRI, 'Manager', 'PRI'],
  [U.headPRI, 'Reviewer', 'PRI'],
  [U.headPLA, 'Reviewer', 'PLA'],
  [U.headPLA, 'Manager', 'PLA'],
  [U.headKLI, 'Reviewer', 'KLI'],
  [U.headKLI, 'Manager', 'KLI'],
  [U.headDAV, 'Reviewer', 'DAV'],
  [U.headDAT, 'Reviewer', 'DAT'],
  [U.headDAT, 'ControlOwner', 'DAT'],
  [U.jana, 'ControlOwner', 'PRI'],
  [U.jana, 'Reviewer', 'PRI'],
  [U.jakub, 'ControlOwner', 'PLA'],
  [U.barbora, 'ControlOwner', 'KLI'],
  [U.ondrej, 'ControlOwner', 'DAV'],
  [U.veronika, 'ControlOwner', 'DAT'],
  [U.filip, 'ControlOwner', 'PLA'],
  [U.alena, 'Auditor', 'ALL'],
];

const lk = (LookupType: LookupItem['LookupType'], Code: string, Label: string, SortOrder: number, ManagerEmail: string | null = null): LookupItem => ({
  LookupId: `${LookupType}-${Code}`,
  LookupType,
  Code,
  Label,
  SortOrder,
  IsActive: true,
  ManagerEmail,
});

export const LOOKUPS: LookupItem[] = [
  lk('Department', 'PRI', 'Zpracování příspěvků', 1, U.headPRI),
  lk('Department', 'PLA', 'Platby a vypořádání', 2, U.headPLA),
  lk('Department', 'KLI', 'Klientské požadavky', 3, U.headKLI),
  lk('Department', 'DAV', 'Výplaty dávek', 4, U.headDAV),
  lk('Department', 'DAT', 'Data a reporting', 5, U.headDAT),
  lk('Category', 'PRISPEVKY', 'Příspěvky účastníků', 1),
  lk('Category', 'PLATBY', 'Platby a párování', 2),
  lk('Category', 'ZADOSTI', 'Klientské žádosti', 3),
  lk('Category', 'DOKUMENTACE', 'Úplnost dokumentace', 4),
  lk('Category', 'TERMINY', 'Procesní termíny', 5),
  lk('Category', 'DAVKY', 'Výplaty dávek', 6),
  lk('Category', 'CHYBY', 'Provozní chyby', 7),
  lk('Category', 'EXPORTY', 'Datové exporty', 8),
  lk('Category', 'SESTAVY', 'Provozní sestavy', 9),
  lk('Category', 'METODIKY', 'Interní metodiky', 10),
  lk('Category', 'PRISTUPY', 'Přístupová práva', 11),
  lk('Priority', 'Low', 'Nízká', 1),
  lk('Priority', 'Normal', 'Běžná', 2),
  lk('Priority', 'High', 'Vysoká', 3),
  lk('RiskLevel', 'Low', 'Nízká', 1),
  lk('RiskLevel', 'Medium', 'Střední', 2),
  lk('RiskLevel', 'High', 'Vysoká', 3),
  lk('RiskLevel', 'Critical', 'Kritická', 4),
  lk('ResultType', 'NoFindings', 'Bez zjištění', 1),
  lk('ResultType', 'WithFindings', 'Se zjištěním', 2),
  lk('ResultType', 'PartiallyMet', 'Částečně splněno', 3),
  lk('ResultType', 'NotMet', 'Nesplněno', 4),
  lk('ResultType', 'NotAssessable', 'Nelze vyhodnotit', 5),
];

export interface SeedControl {
  code: string;
  name: string;
  cat: string;
  dept: string;
  risk: RiskLevel;
  prio: Priority;
  type: RecurrenceType;
  interval?: number;
  /** relativní / absolutní start; 'H' = začátek historie */
  start: string;
  days?: number[];
  mode?: MonthlyMode;
  dom?: number;
  nth?: number;
  period?: PeriodMode;
  due: [number, DueUnit];
  owner: string;
  backup: string | null;
  reviewer: string | null;
  approval: boolean;
  desc: string;
  objective: string;
  steps: string[];
  evidence: Array<[string, boolean]>;
  remindersBefore?: number[];
  archivedAt?: string;
}

export const SEED_CONTROLS: SeedControl[] = [
  // ---------------- Zpracování příspěvků (PRI)
  {
    code: 'CTRL-0001', name: 'Párování příchozích příspěvků účastníků', cat: 'PRISPEVKY', dept: 'PRI', risk: 'High', prio: 'High', type: 'Workday', start: 'H', period: 'Previous', due: [1, 'Workdays'],
    owner: U.jana, backup: U.filip, reviewer: null, approval: false, remindersBefore: [0],
    desc: 'Denní ověření, že všechny příchozí platby příspěvků z předchozího pracovního dne byly spárovány na smlouvy účastníků.',
    objective: 'Zajistit úplné a včasné připsání příspěvků na účty účastníků.',
    steps: ['Porovnat počet a objem plateb z bankovního výpisu se zaúčtovanými příspěvky', 'Prověřit nespárované platby nad 1 000 Kč', 'Ověřit, že automatické párování nevykazuje chybové stavy', 'Zaznamenat odchylky do evidence provozních chyb'],
    evidence: [['Výpis nespárovaných plateb', false]],
  },
  {
    code: 'CTRL-0002', name: 'Kontrola zaúčtování příspěvků zaměstnavatelů', cat: 'PRISPEVKY', dept: 'PRI', risk: 'High', prio: 'High', type: 'Monthly', start: 'H', mode: 'NthWorkday', nth: 5, period: 'Previous', due: [3, 'Workdays'],
    owner: U.jana, backup: U.veronika, reviewer: U.headPRI, approval: true,
    desc: 'Měsíční kontrola, že hromadné platby zaměstnavatelů byly rozúčtovány podle předaných seznamů zaměstnanců.',
    objective: 'Ověřit správnost rozúčtování příspěvků zaměstnavatelů za uplynulý měsíc.',
    steps: ['Odsouhlasit součet hromadných plateb se seznamy zaměstnanců', 'Prověřit vzorek 20 rozúčtování', 'Ověřit vyřízení rozdílů z minulého měsíce', 'Potvrdit, že nevyřízené rozdíly jsou eskalovány zaměstnavateli'],
    evidence: [['Rekapitulace rozúčtování (export)', true], ['Seznam rozdílů', false]],
  },
  {
    code: 'CTRL-0003', name: 'Kontrola nároku a vypořádání státních příspěvků', cat: 'PRISPEVKY', dept: 'PRI', risk: 'Critical', prio: 'High', type: 'Monthly', start: 'H', mode: 'DayOfMonth', dom: 20, period: 'Previous', due: [2, 'Workdays'],
    owner: U.jana, backup: U.veronika, reviewer: U.headPRI, approval: true,
    desc: 'Kontrola podkladů žádosti o státní příspěvek a následného vypořádání přijatých prostředků.',
    objective: 'Zajistit správnost žádosti a připsání státních příspěvků.',
    steps: ['Ověřit úplnost dávky žádostí', 'Odsouhlasit přijatou částku s žádostí', 'Prověřit zamítnuté položky a jejich důvody', 'Ověřit opravné dávky z předchozího období'],
    evidence: [['Protokol odeslání žádosti', true], ['Odsouhlasení přijatých prostředků', true]],
  },
  {
    code: 'CTRL-0004', name: 'Kontrola neidentifikovaných plateb starších 30 dnů', cat: 'PLATBY', dept: 'PRI', risk: 'Medium', prio: 'Normal', type: 'Weekly', start: 'H', days: [1], period: 'Previous', due: [2, 'Workdays'],
    owner: U.jana, backup: U.filip, reviewer: null, approval: false,
    desc: 'Týdenní revize plateb, které se nepodařilo přiřadit déle než 30 dní.',
    objective: 'Minimalizovat objem neidentifikovaných plateb a zajistit jejich vrácení či dohledání.',
    steps: ['Vygenerovat sestavu neidentifikovaných plateb', 'Ověřit aktivní dohledávání u každé položky', 'Navrhnout vrácení u plateb starších 90 dnů'],
    evidence: [['Sestava neidentifikovaných plateb', true]],
  },
  {
    code: 'CTRL-0005', name: 'Kontrola změn sazeb příspěvků v systému', cat: 'PRISPEVKY', dept: 'PRI', risk: 'Medium', prio: 'Normal', type: 'Quarterly', start: '2026-04-10', mode: 'DayOfMonth', dom: 10, period: 'Previous', due: [5, 'Workdays'],
    owner: U.jana, backup: U.veronika, reviewer: U.headPRI, approval: true,
    desc: 'Čtvrtletní ověření, že změny sazeb příspěvků zadané v systému odpovídají žádostem účastníků.',
    objective: 'Zabránit chybnému předpisu příspěvků po změně sazby.',
    steps: ['Vybrat vzorek 25 změn sazeb', 'Porovnat se žádostmi účastníků', 'Ověřit schválení změn druhou osobou'],
    evidence: [['Vzorek změn s výsledkem', true]],
  },
  {
    code: 'CTRL-0006', name: 'Revize metodiky zpracování příspěvků', cat: 'METODIKY', dept: 'PRI', risk: 'Low', prio: 'Low', type: 'Annual', start: '2026-11-30', mode: 'DayOfMonth', dom: 30, period: 'Current', due: [10, 'Workdays'],
    owner: U.headPRI, backup: U.jana, reviewer: U.coord, approval: true,
    desc: 'Roční revize interní metodiky zpracování příspěvků a souvisejících pracovních postupů.',
    objective: 'Udržet metodiku aktuální vůči skutečnému procesu.',
    steps: ['Porovnat metodiku se skutečným postupem', 'Zapracovat změny procesu za uplynulý rok', 'Předložit revizi ke schválení'],
    evidence: [['Revidovaná metodika', true]],
  },
  // ---------------- Platby a vypořádání (PLA)
  {
    code: 'CTRL-0007', name: 'Denní rekonciliace bankovních účtů', cat: 'PLATBY', dept: 'PLA', risk: 'Critical', prio: 'High', type: 'Workday', start: 'H', period: 'Previous', due: [1, 'Workdays'],
    owner: U.jakub, backup: U.filip, reviewer: null, approval: false, remindersBefore: [0],
    desc: 'Odsouhlasení zůstatků bankovních účtů s účetní evidencí za předchozí pracovní den.',
    objective: 'Včas odhalit rozdíly mezi bankou a účetnictvím.',
    steps: ['Odsouhlasit konečné zůstatky všech účtů', 'Vysvětlit každý rozdíl', 'Ověřit zaúčtování bankovních poplatků'],
    evidence: [['Rekonciliační list', false]],
  },
  {
    code: 'CTRL-0008', name: 'Kontrola nespárovaných transakcí', cat: 'PLATBY', dept: 'PLA', risk: 'Medium', prio: 'Normal', type: 'Weekly', start: 'H', days: [3, 5], period: 'Previous', due: [1, 'Workdays'],
    owner: U.filip, backup: U.jakub, reviewer: null, approval: false,
    desc: 'Dvakrát týdně revize transakcí, které systém nespároval automaticky.',
    objective: 'Udržet počet nespárovaných transakcí pod limitem.',
    steps: ['Vygenerovat seznam nespárovaných transakcí', 'Ručně spárovat jednoznačné případy', 'Eskalovat položky starší 10 dnů'],
    evidence: [],
  },
  {
    code: 'CTRL-0009', name: 'Kontrola odchozích plateb nad limit (4 oči)', cat: 'PLATBY', dept: 'PLA', risk: 'High', prio: 'High', type: 'Weekly', start: 'H', days: [2], period: 'Previous', due: [1, 'Workdays'],
    owner: U.jakub, backup: U.filip, reviewer: U.headPLA, approval: true,
    desc: 'Týdenní ověření, že všechny odchozí platby nad interní limit byly autorizovány dvěma osobami.',
    objective: 'Potvrdit dodržení principu čtyř očí u významných plateb.',
    steps: ['Vybrat platby nad limit za období', 'Ověřit dvojí autorizaci u každé platby', 'Prověřit shodu příjemce s podkladem'],
    evidence: [['Seznam plateb nad limit s autorizacemi', true]],
  },
  {
    code: 'CTRL-0010', name: 'Měsíční vypořádání s depozitářem', cat: 'PLATBY', dept: 'PLA', risk: 'Critical', prio: 'High', type: 'Monthly', start: 'H', mode: 'LastDayOfMonth', period: 'Current', due: [3, 'Workdays'],
    owner: U.jakub, backup: U.filip, reviewer: U.headPLA, approval: true,
    desc: 'Odsouhlasení stavu peněžních prostředků a pohybů s výpisem depozitáře ke konci měsíce.',
    objective: 'Zajistit shodu evidence s depozitářem.',
    steps: ['Odsouhlasit zůstatky k poslednímu dni měsíce', 'Odsouhlasit pohyby za měsíc', 'Vysvětlit a zdokumentovat rozdíly', 'Potvrdit vyřízení rozdílů z předchozího měsíce'],
    evidence: [['Výpis depozitáře', true], ['Odsouhlasovací protokol', true]],
  },
  {
    code: 'CTRL-0011', name: 'Kontrola vratek přeplatků', cat: 'PLATBY', dept: 'PLA', risk: 'Medium', prio: 'Normal', type: 'Weekly', interval: 2, start: 'H', days: [4], period: 'Previous', due: [2, 'Workdays'],
    owner: U.filip, backup: U.jakub, reviewer: null, approval: false,
    desc: 'Každé dva týdny ověření, že identifikované přeplatky byly vráceny správným plátcům.',
    objective: 'Zajistit včasné a správné vracení přeplatků.',
    steps: ['Vybrat přeplatky identifikované v období', 'Ověřit vrácení na původní účet', 'Ověřit komunikaci s plátcem'],
    evidence: [['Seznam vratek', true]],
  },
  {
    code: 'CTRL-0012', name: 'Kontrola podpisových práv k platebním účtům', cat: 'PRISTUPY', dept: 'PLA', risk: 'High', prio: 'High', type: 'SemiAnnual', start: '2026-01-15', mode: 'DayOfMonth', dom: 15, period: 'Previous', due: [10, 'Workdays'],
    owner: U.headPLA, backup: U.jakub, reviewer: U.coord, approval: true,
    desc: 'Pololetní ověření aktuálnosti podpisových vzorů a disponentských práv k bankovním účtům.',
    objective: 'Zajistit, že k účtům disponují jen oprávněné osoby.',
    steps: ['Získat seznam disponentů od banky', 'Porovnat s aktuálním organizačním stavem', 'Iniciovat odebrání práv odešlým zaměstnancům'],
    evidence: [['Seznam disponentů od banky', true]],
  },
  // ---------------- Klientské požadavky (KLI)
  {
    code: 'CTRL-0013', name: 'Kontrola lhůt vyřízení klientských žádostí', cat: 'TERMINY', dept: 'KLI', risk: 'High', prio: 'High', type: 'Weekly', start: 'H', days: [1], period: 'Previous', due: [2, 'Workdays'],
    owner: U.barbora, backup: U.filip, reviewer: null, approval: false,
    desc: 'Týdenní kontrola dodržení interních lhůt vyřízení žádostí účastníků.',
    objective: 'Včas identifikovat žádosti, kterým hrozí překročení lhůty.',
    steps: ['Vygenerovat přehled otevřených žádostí podle stáří', 'Prověřit žádosti nad 80 % lhůty', 'Eskalovat žádosti po lhůtě vedoucímu'],
    evidence: [['Přehled žádostí podle stáří', true]],
  },
  {
    code: 'CTRL-0014', name: 'Kontrola úplnosti dokumentace nových smluv', cat: 'DOKUMENTACE', dept: 'KLI', risk: 'Medium', prio: 'Normal', type: 'Monthly', start: 'H', mode: 'DayOfMonth', dom: 10, period: 'Previous', due: [5, 'Workdays'],
    owner: U.barbora, backup: U.filip, reviewer: U.headKLI, approval: true,
    desc: 'Měsíční vzorková kontrola úplnosti dokumentace u nově uzavřených smluv.',
    objective: 'Zajistit, že každá nová smlouva má kompletní dokumentaci.',
    steps: ['Vybrat náhodný vzorek 30 nových smluv', 'Ověřit přítomnost povinných dokumentů', 'Ověřit správnost identifikačních údajů', 'Zadat doplnění chybějících dokumentů'],
    evidence: [['Kontrolní list vzorku', true]],
  },
  {
    code: 'CTRL-0015', name: 'Kontrola změn osobních údajů účastníků (vzorek)', cat: 'ZADOSTI', dept: 'KLI', risk: 'Medium', prio: 'Normal', type: 'Monthly', start: 'H', mode: 'DayOfMonth', dom: 31, period: 'Current', due: [3, 'Workdays'],
    owner: U.barbora, backup: U.filip, reviewer: null, approval: false,
    desc: 'Měsíční vzorková kontrola změn osobních údajů provedených na základě žádostí. Plánováno na 31. den – v kratších měsících poslední den.',
    objective: 'Ověřit, že změny údajů byly provedeny na základě řádné žádosti.',
    steps: ['Vybrat vzorek 15 změn', 'Ověřit existenci a ověření žádosti', 'Ověřit správnost provedené změny'],
    evidence: [['Vzorek změn s výsledkem', true]],
  },
  {
    code: 'CTRL-0016', name: 'Kontrola vyřízení stížností', cat: 'ZADOSTI', dept: 'KLI', risk: 'Medium', prio: 'Normal', type: 'Monthly', interval: 2, start: '2026-05-15', mode: 'DayOfMonth', dom: 15, period: 'Previous', due: [5, 'Workdays'],
    owner: U.headKLI, backup: U.barbora, reviewer: U.coord, approval: true,
    desc: 'Dvouměsíční kontrola evidence a vyřízení stížností.',
    objective: 'Zajistit úplnou evidenci a včasné vyřízení stížností.',
    steps: ['Odsouhlasit evidenci stížností s doručenou poštou', 'Ověřit dodržení lhůty odpovědi', 'Vyhodnotit opakující se příčiny'],
    evidence: [['Přehled stížností', true]],
  },
  {
    code: 'CTRL-0017', name: 'Kontrola plných mocí a zastoupení', cat: 'DOKUMENTACE', dept: 'KLI', risk: 'Low', prio: 'Low', type: 'Quarterly', start: '2026-04-20', mode: 'DayOfMonth', dom: 20, period: 'Previous', due: [5, 'Workdays'],
    owner: U.barbora, backup: U.filip, reviewer: null, approval: false,
    desc: 'Čtvrtletní kontrola platnosti evidovaných plných mocí.',
    objective: 'Zabránit jednání na základě neplatné plné moci.',
    steps: ['Vygenerovat přehled plných mocí s omezenou platností', 'Označit expirované plné moci', 'Ověřit vzorek nově evidovaných'],
    evidence: [],
  },
  {
    code: 'CTRL-0018', name: 'Kontrola archivace klientské korespondence', cat: 'DOKUMENTACE', dept: 'KLI', risk: 'Low', prio: 'Low', type: 'SemiAnnual', start: '2026-06-30', mode: 'LastDayOfMonth', period: 'Current', due: [10, 'Workdays'],
    owner: U.barbora, backup: U.filip, reviewer: U.headKLI, approval: true,
    desc: 'Pololetní ověření, že korespondence je archivována dle spisového řádu.',
    objective: 'Zajistit dohledatelnost korespondence.',
    steps: ['Vybrat vzorek 20 spisů', 'Ověřit úplnost korespondence', 'Ověřit skartační lhůty'],
    evidence: [['Protokol vzorku', true]],
  },
  // ---------------- Výplaty dávek (DAV)
  {
    code: 'CTRL-0019', name: 'Kontrola výpočtu jednorázových vyrovnání', cat: 'DAVKY', dept: 'DAV', risk: 'High', prio: 'High', type: 'Weekly', start: 'H', days: [4], period: 'Previous', due: [1, 'Workdays'],
    owner: U.ondrej, backup: U.veronika, reviewer: U.headDAV, approval: true,
    desc: 'Týdenní přepočet vzorku jednorázových vyrovnání před jejich výplatou.',
    objective: 'Zabránit chybné výši vyplacených vyrovnání.',
    steps: ['Vybrat vzorek 10 vyrovnání', 'Nezávisle přepočítat výši', 'Ověřit srážky a zdanění', 'Ověřit identitu příjemce'],
    evidence: [['Přepočet vzorku', true]],
  },
  {
    code: 'CTRL-0020', name: 'Kontrola výplat starobních penzí', cat: 'DAVKY', dept: 'DAV', risk: 'Critical', prio: 'High', type: 'Monthly', start: 'H', mode: 'NthWorkday', nth: 3, period: 'Current', due: [2, 'Workdays'],
    owner: U.ondrej, backup: U.veronika, reviewer: U.headDAV, approval: true,
    desc: 'Měsíční kontrola dávky výplat pravidelných penzí před odesláním do banky.',
    objective: 'Zajistit správnost a úplnost pravidelných výplat.',
    steps: ['Odsouhlasit počet a objem výplat s předchozím měsícem', 'Prověřit nové a ukončené výplaty', 'Ověřit změny bankovních spojení'],
    evidence: [['Rekapitulace výplatní dávky', true]],
  },
  {
    code: 'CTRL-0021', name: 'Kontrola srážkové daně z dávek', cat: 'DAVKY', dept: 'DAV', risk: 'High', prio: 'High', type: 'Monthly', start: 'H', mode: 'DayOfMonth', dom: 15, period: 'Previous', due: [3, 'Workdays'],
    owner: U.ondrej, backup: U.veronika, reviewer: U.headDAV, approval: false,
    desc: 'Měsíční ověření správnosti výpočtu a odvodu srážkové daně z vyplacených dávek.',
    objective: 'Zajistit správný výpočet a odvod daně.',
    steps: ['Odsouhlasit sraženou daň s výplatami', 'Ověřit uplatnění osvobození', 'Ověřit včasnost odvodu'],
    evidence: [['Rekapitulace srážkové daně', true]],
  },
  {
    code: 'CTRL-0022', name: 'Kontrola výplat při úmrtí účastníka', cat: 'DAVKY', dept: 'DAV', risk: 'Medium', prio: 'Normal', type: 'Monthly', start: 'H', mode: 'DayOfMonth', dom: 25, period: 'Current', due: [5, 'Workdays'],
    owner: U.ondrej, backup: U.veronika, reviewer: null, approval: false,
    desc: 'Měsíční kontrola vyřízení případů úmrtí účastníků a výplat oprávněným osobám.',
    objective: 'Zajistit výplatu správným oprávněným osobám.',
    steps: ['Prověřit otevřené případy úmrtí', 'Ověřit podklady oprávněných osob', 'Ověřit zastavení pravidelných výplat'],
    evidence: [],
  },
  {
    code: 'CTRL-0023', name: 'Kontrola podmínek nároku na předčasnou penzi', cat: 'DAVKY', dept: 'DAV', risk: 'High', prio: 'Normal', type: 'Quarterly', start: '2026-04-05', mode: 'DayOfMonth', dom: 5, period: 'Previous', due: [5, 'Workdays'],
    owner: U.ondrej, backup: U.veronika, reviewer: U.headDAV, approval: true,
    desc: 'Čtvrtletní vzorkové ověření splnění podmínek nároku u přiznaných předčasných penzí.',
    objective: 'Zabránit přiznání dávky bez splnění podmínek.',
    steps: ['Vybrat vzorek přiznaných dávek', 'Ověřit splnění podmínek nároku', 'Ověřit kompletnost žádosti'],
    evidence: [['Kontrolní list vzorku', true]],
  },
  {
    code: 'CTRL-0024', name: 'Kontrola pozastavených výplat', cat: 'DAVKY', dept: 'DAV', risk: 'Medium', prio: 'Normal', type: 'Weekly', interval: 2, start: 'H', days: [1], period: 'Previous', due: [2, 'Workdays'],
    owner: U.ondrej, backup: U.veronika, reviewer: null, approval: false,
    desc: 'Každé dva týdny revize výplat pozastavených z důvodu chybějících podkladů.',
    objective: 'Zajistit, že pozastavené výplaty jsou aktivně řešeny.',
    steps: ['Vygenerovat seznam pozastavených výplat', 'Ověřit výzvu k doplnění podkladů', 'Uvolnit výplaty s doplněnými podklady'],
    evidence: [['Seznam pozastavených výplat', true]],
  },
  // ---------------- Data a reporting (DAT)
  {
    code: 'CTRL-0025', name: 'Kontrola denního exportu dat do účetního systému', cat: 'EXPORTY', dept: 'DAT', risk: 'Medium', prio: 'Normal', type: 'Daily', start: 'H', period: 'Previous', due: [0, 'CalendarDays'],
    owner: U.veronika, backup: U.headDAT, reviewer: null, approval: false, remindersBefore: [0],
    desc: 'Denní ověření, že noční export dat do účetního systému proběhl úplně a bez chyb.',
    objective: 'Včas zachytit neúplný nebo chybný export.',
    steps: ['Ověřit stav úlohy exportu', 'Odsouhlasit počty záznamů exportu a importu', 'Prověřit chybový log'],
    evidence: [],
  },
  {
    code: 'CTRL-0026', name: 'Kontrola měsíčního reportu pro vedení', cat: 'SESTAVY', dept: 'DAT', risk: 'Medium', prio: 'Normal', type: 'Monthly', start: 'H', mode: 'NthWorkday', nth: 2, period: 'Previous', due: [3, 'Workdays'],
    owner: U.veronika, backup: U.headDAT, reviewer: U.headDAT, approval: true,
    desc: 'Měsíční ověření správnosti dat v provozním reportu pro vedení společnosti.',
    objective: 'Zajistit správnost údajů předkládaných vedení.',
    steps: ['Odsouhlasit klíčové ukazatele se zdrojovými systémy', 'Ověřit meziměsíční změny nad 10 %', 'Ověřit úplnost komentářů'],
    evidence: [['Odsouhlasení ukazatelů', true]],
  },
  {
    code: 'CTRL-0027', name: 'Kontrola evidence provozních chyb a incidentů', cat: 'CHYBY', dept: 'DAT', risk: 'Medium', prio: 'Normal', type: 'Weekly', start: 'H', days: [5], period: 'Current', due: [1, 'Workdays'],
    owner: U.veronika, backup: U.headDAT, reviewer: null, approval: false,
    desc: 'Týdenní kontrola úplnosti evidence provozních chyb a stavu jejich řešení.',
    objective: 'Zajistit, že každá provozní chyba je evidována a řešena.',
    steps: ['Odsouhlasit evidenci s hlášeními z útvarů', 'Ověřit přiřazení řešitele', 'Eskalovat chyby bez řešení déle než 14 dní'],
    evidence: [['Přehled provozních chyb', true]],
  },
  {
    code: 'CTRL-0028', name: 'Kontrola přístupových práv do aplikací backoffice', cat: 'PRISTUPY', dept: 'DAT', risk: 'High', prio: 'High', type: 'Quarterly', start: '2026-04-15', mode: 'DayOfMonth', dom: 15, period: 'Previous', due: [10, 'Workdays'],
    owner: U.headDAT, backup: U.veronika, reviewer: U.coord, approval: true,
    desc: 'Čtvrtletní recertifikace přístupových práv uživatelů do aplikací backoffice.',
    objective: 'Zajistit, že uživatelé mají jen nezbytně nutná oprávnění.',
    steps: ['Získat přehled oprávnění z aplikací', 'Nechat vedoucí potvrdit oprávnění podřízených', 'Odebrat nepotvrzená oprávnění'],
    evidence: [['Recertifikační přehled', true]],
  },
  {
    code: 'CTRL-0029', name: 'Kontrola exportu pro statistické výkazy', cat: 'EXPORTY', dept: 'DAT', risk: 'Medium', prio: 'Normal', type: 'Monthly', start: '2026-08-12', mode: 'DayOfMonth', dom: 12, period: 'Previous', due: [3, 'Workdays'],
    owner: U.veronika, backup: U.headDAT, reviewer: U.headDAT, approval: true,
    desc: 'Měsíční kontrola úplnosti a konzistence datového exportu pro statistické výkazy.',
    objective: 'Zajistit správnost podkladů pro výkaznictví.',
    steps: ['Ověřit úplnost exportu', 'Provést kontrolní součty', 'Porovnat s předchozím obdobím'],
    evidence: [['Kontrolní součty exportu', true]],
  },
  {
    code: 'CTRL-0030', name: 'Roční revize katalogu interních kontrol', cat: 'METODIKY', dept: 'DAT', risk: 'Low', prio: 'Normal', type: 'Annual', start: '2026-12-15', mode: 'DayOfMonth', dom: 15, period: 'Current', due: [10, 'Workdays'],
    owner: U.coord, backup: U.headDAT, reviewer: U.director, approval: true,
    desc: 'Roční revize katalogu interních kontrol, jejich frekvencí a odpovědností.',
    objective: 'Udržet katalog kontrol v souladu s riziky procesů.',
    steps: ['Vyhodnotit výsledky kontrol za rok', 'Navrhnout změny frekvencí a rozsahu', 'Projednat se zástupci útvarů'],
    evidence: [['Návrh revize katalogu', true]],
  },
  {
    code: 'CTRL-0031', name: 'Jednorázová kontrola migrace dat po upgradu systému', cat: 'EXPORTY', dept: 'DAT', risk: 'High', prio: 'High', type: 'OneTime', start: '+9', period: 'Current', due: [5, 'Workdays'],
    owner: U.veronika, backup: U.headDAT, reviewer: U.headDAT, approval: true,
    desc: 'Jednorázové ověření úplnosti a správnosti dat po plánovaném upgradu evidenčního systému.',
    objective: 'Potvrdit, že migrace nezpůsobila ztrátu ani poškození dat.',
    steps: ['Odsouhlasit počty smluv před a po migraci', 'Ověřit vzorek 50 smluv', 'Ověřit funkčnost klíčových sestav'],
    evidence: [['Protokol odsouhlasení migrace', true]],
  },
  {
    code: 'CTRL-0032', name: 'Kontrola faxových žádostí (zrušený kanál)', cat: 'ZADOSTI', dept: 'KLI', risk: 'Low', prio: 'Low', type: 'Weekly', start: 'H', days: [3], period: 'Previous', due: [2, 'Workdays'],
    owner: U.barbora, backup: U.filip, reviewer: null, approval: false, archivedAt: '2026-07-15',
    desc: 'Týdenní kontrola zpracování žádostí doručených faxem.',
    objective: 'Zajistit zpracování žádostí z faxového kanálu.',
    steps: ['Odsouhlasit přijaté faxy s evidencí', 'Ověřit zpracování'],
    evidence: [],
  },
];

export const SEED_OWNER_LATE_PROB: Record<string, number> = {
  [U.jana]: 0.06,
  [U.jakub]: 0.09,
  [U.barbora]: 0.08,
  [U.ondrej]: 0.2,
  [U.veronika]: 0.05,
  [U.filip]: 0.13,
  [U.headDAT]: 0.12,
  [U.headPRI]: 0.1,
  [U.headPLA]: 0.1,
  [U.headKLI]: 0.1,
  [U.coord]: 0.05,
};

export const FINDING_TEXTS: Array<[string, string]> = [
  ['Rozdíl mezi bankovním výpisem a evidencí ve výši 12 480 Kč nebyl vysvětlen.', 'Dohledat původ rozdílu a provést opravné zaúčtování.'],
  ['U 3 položek vzorku chybí doklad o ověření totožnosti.', 'Vyžádat chybějící doklady a doplnit do spisu.'],
  ['Dvě platby nad limit byly autorizovány pouze jednou osobou.', 'Doplnit dodatečnou autorizaci a proškolit tým.'],
  ['Export neobsahoval záznamy z jedné pobočkové databáze.', 'Opravit konfiguraci exportu a provést doplňkový export.'],
  ['Překročena interní lhůta vyřízení u 5 žádostí.', 'Prioritně vyřídit a upravit rozdělování práce.'],
  ['Chybné uplatnění osvobození od daně u jedné výplaty.', 'Provést opravu výpočtu a dodatečný odvod.'],
  ['Neaktualizovaný disponent u jednoho bankovního účtu.', 'Podat žádost o změnu disponentských práv.'],
  ['Neúplná evidence provozních chyb za sledované období.', 'Doplnit evidenci a nastavit pravidelné odsouhlasení.'],
  ['Rozdíl v počtu záznamů mezi exportem a importem (14 záznamů).', 'Prověřit chybový log a záznamy znovu zpracovat.'],
  ['Nesoulad sazby příspěvku se žádostí účastníka u 2 smluv.', 'Opravit sazbu a dopočítat předpis.'],
];
