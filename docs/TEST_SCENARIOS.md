# TEST_SCENARIOS – ověřovací scénáře

Legenda sloupce **Ověřeno**: **A** = automatický test (`npm test`, Vitest – 45 testů v `tests/`), **B** = ručně
ověřeno v prohlížeči nad demo daty (20. 11. 2026), **–** = scénář je v aplikaci připraven, ale v rámci dodávky
nebyl ručně proklikán.

Demo účty se přepínají v pravém horním rohu (žádná hesla). Testovací datum: Administrace → Demo režim.

| # | Scénář | Kroky | Očekávaný výsledek | Ověřeno |
|---|---|---|---|---|
| 1 | Vytvoření nové kontroly | Koordinátor/Admin → Registr → Nová kontrola → vyplnit 7 kroků → Uložit | Kontrola `CTRL-00xx`, verze v1, auditní záznamy „Založení kontroly“, „Vytvoření verze v1“, „Vygenerování výskytů“, upozornění „Nově přidělená kontrola“ odpovědné osobě a zástupci | A, B (CTRL-0033, 12 výskytů) |
| 2 | Automatické vytvoření opakovaných výskytů | Po uložení / Administrace → Nastavení opakování → Spustit generování | Samostatné běhy na 12 měsíců; každý má GUID a `OccurrenceKey`; opakované spuštění vytvoří 0 nových („přeskočeno N“) | A |
| 3 | Editace jednoho výskytu | Detail běhu → Změnit termín / odpovědnost → „Upravit pouze tento výskyt“ → nový termín + důvod | Mění se jen tento běh (`IsOneTimeOverride`), ostatní výskyty a definice beze změny; audit po polích s důvodem; bez důvodu nelze uložit | A |
| 4 | Editace všech budoucích výskytů | Detail kontroly → Upravit definici (nebo z běhu „tento a následující“) → změna dne → krok Účinnost → důvod → potvrdit | Nová verze v2; předchozí verze `EffectiveTo` = den před účinností; náhled dopadu (aktualizace / nové / nahrazené / konflikty); po uložení počty sedí | A, B (CTRL-0033: 12 nahrazeno, 12 nových) |
| 5 | Kontrola zachování historie | Po scénáři 4 otevřít dokončený běh | Dokončený běh zůstává na v1, název i metodika původní, protokol nezměněn (hash sedí) | A |
| 6 | Změna odpovědné osoby | a) jednorázově (scénář 3), b) novou verzí | a) jen jeden běh; b) plánované běhy od účinnosti dostanou novou osobu, rozpracované zůstanou; nová osoba dostane upozornění | A |
| 7 | Změna termínu | jednorázová změna `DueDate` | `DueMonthKey` přepočten; upozornění „Změna termínu“; dashboard/kalendář běh přesune | A |
| 8 | Kontrola vzniklého prodlení | Testovací datum za termín otevřeného běhu | Štítek „Po termínu N dní“, KPI Po termínu +1, položka v „Moje kontroly → Po termínu“ | A, B |
| 9 | Odeslání připomínky | Testovací datum 3 dny před termínem → Upozornění → Simulovat denní kontrolu | Upozornění „Blížící se termín“ s důvodem „Pravidlo 3 dny před termínem…“; záznam v evidenci; e-mail se neodešle | A, B |
| 10 | Zabránění duplicitnímu oznámení | Simulaci spustit 2× týž den | Druhý běh: 0 nových, všechny kandidáty v „Zabráněno duplicitám“ s deduplikačním klíčem | A, B (2. běh: 0 nových, 47 zablokováno) |
| 11 | Provedení kontroly | Vlastník (Jana Nováková) → Moje kontroly → Pokračovat → kroky, výsledek, přílohy → Dokončit | Stav Completed, `CompletedBy`, `SubmittedAt`; běh uzamčen; protokol vytvořen | A, B (CTRL-0004) |
| 12 | Kontrola povinných příloh | Pokus o dokončení bez povinné přílohy | Tlačítko zablokováno, kontrolní panel „Chybí přílohy: …“; po nahrání odblokováno | A, B |
| 13 | Odeslání ke schválení | Běh s `ApprovalRequired` → Odeslat ke schválení | Stav Submitted; upozornění schvalovateli; protokol zatím nevzniká | A |
| 14 | Vrácení k doplnění | Schvalovatel (Petr Svoboda) → Ke schválení → Posoudit → komentář → Vrátit | Stav Returned, `ReturnCount + 1`, komentář viditelný vlastníkovi, upozornění; bez komentáře nelze | A, B |
| 15 | Finální schválení | Po doplnění a odeslání → schvalovatel → Schválit | Stav Completed, `ApprovedBy`, `ApprovedAt`; protokol; provádějící nesmí schválit (4 oči) | A |
| 16 | Generování protokolu | Po scénáři 11 / 15 → záložka Protokoly → Náhled / PDF | PDF `PRT-<kontrola>-<běh>-V1.pdf` ve složce `CTRL-xxxx/RUN-xxxx/Protocols`; obsahuje všech 16 požadovaných částí; česká diakritika | A, B (PDF vizuálně zkontrolováno) |
| 17 | Ověření historie PDF | Protokol → Ověřit integritu; změnit definici; znovu ověřit | Hash snapshotu sedí; obsah protokolu se nezměnil | A |
| 18 | Vytvoření nápravného opatření | Výsledek „Se zjištěním“ → Založit nápravné opatření | Zjištění `FND-RRRR-nnnn`; bez zjištění nelze odeslat; v protokolu sekce zjištění | A |
| 19 | Generování měsíčního reportu | Reporty → Vygenerovat → uzavřený měsíc | Snapshot + PDF v `IC_ManagementReports/RRRR/RRRR-MM`; opakování = nová verze; aktuální měsíc odmítnut | A, B (říjen v2) |
| 20 | Kontrola správnosti dashboardu | Porovnat KPI s prokliknutým seznamem | Počet řádků seznamu = hodnota KPI (stejná funkce výběru); míra včasnosti nezahrnuje zrušené ani budoucí termíny | A (výpočet), B (proklik) |
| 21 | Ověření rolí | Přepnout: Vlastník, Schvalovatel, Manažer, Auditor, Koordinátor, Admin | Menu i akce odpovídají roli; Auditor jen čte; Vlastník vidí jen své běhy; služby odmítnou nepovolené akce | A (4 oči, oprávnění služeb), B (menu a akce) |
| 22 | Obnovení stránky a zachování dat | Provést změnu → F5 | Změna zachována (IndexedDB) | B |
| 23 | Simulace změny měsíce | Demo režim → testovací datum 1. 12. → Simulovat denní kontrolu → Reporty → listopad | Nové připomínky/eskalace, generování horizontu, report za listopad | A (testovací datum v testech) |
| 24 | Kontrola přestupného roku | Kontrola s dnem 29 / ročně 29. 2. 2028 | 2027 → 28. 2., 2028 → 29. 2. | A |
| 25 | Termín 31. dne v kratším měsíci | Měsíční kontrola, den 31 (demo CTRL-0015) | Únor → 28. 2., duben → 30. 4.; s politikou „vynechat“ se výskyt vynechá | A |
| 26 | Současná editace dvěma uživateli | Dvě záložky, dva uživatelé, stejný běh; uložit v jedné, pak ve druhé | Druhé uložení odmítnuto („Záznam byl mezitím změněn…“), banner „Načíst aktuální“; jednorázová úprava se zastaralou verzí odmítnuta | A |
| 27 | Archivace kontroly | Detail → Archivovat → důvod | `IsActive = false`; budoucí naplánované běhy zrušeny (nahrazeny), rozpracované ponechány; historie zachována; reaktivace vygeneruje znovu | A |
| 28 | Filtrace velkého počtu dat | Demo ~2 200 běhů: filtry dashboardu, registru, kalendáře | Okamžitá odezva; pro 10–50 tis. běhů viz delegační strategie v POWERAPPS_MIGRATION kap. D | B (2 200 běhů); výkon nad 50 tis. – |
| 29 | Přepočet KPI po změně stavu | Dokončit běh → Dashboard | „Dokončené kontroly“ +1 a související metriky se přepočtou bez obnovení stránky | B (61 → 62) |
| 30 | Nová definice neovlivní staré protokoly | Dokončit a schválit běh → změnit název a metodiku novou verzí → otevřít protokol | Protokol obsahuje původní název a metodiku v1; hash platný | A |

## Automatické testy (soubory)

| Soubor | Pokrytí |
|---|---|
| `tests/dates-recurrence.test.ts` | pražské pásmo a letní čas, Velikonoce a svátky, pracovní dny, všechny frekvence, 31. den, přestupný rok, posun víkendu, termín v pracovních dnech, období a `RunCode`, stabilní klíč |
| `tests/versioning-metrics.test.ts` | idempotentní generování, prodloužení horizontu, nová verze (uzavřené beze změny, konflikty, zachování jednorázových úprav, nahrazení, „období již pokryto“), validace důvodu a 4 očí, archivace, odvozené stavy, KPI vč. zrušených, rekonstrukce stavu k datu, připomínky a deduplikace, eskalace, stop po dokončení, schvalovací připomínka, validace odeslání |
| `tests/services.test.ts` | integrační testy služeb nad paměťovým úložištěm se stejnou sémantikou jako IndexedDB: založení kontroly, unikátní index (DB odmítne duplicitu), jednorázová úprava + souběžnost, nová verze se zachováním protokolu, archivace/reaktivace, celý cyklus provedení → vrácení → schválení → protokol, 4 oči, denní kontrola bez duplicit, neměnnost reportu a verze, konzistence demo dat |

Spuštění: `npm test` (v adresáři `control-hub`).
