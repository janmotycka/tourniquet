/**
 * ImportPlayersModal — modal pro import hráčů z XLSX/CSV exportu.
 *
 * Flow:
 *  1. Uživatel vybere soubor → parseRosterFile() detekuje formát + sloupce
 *  2. Pokud je víc listů, nabídne výběr listu (EOS má hráče vs trenéry)
 *  3. Zobrazí preview tabulku se zaškrtávátky pro každý řádek
 *  4. Pokud detekce neproběhla správně, lze ručně přemapovat sloupce
 *  5. Vybere se cílová věková kategorie
 *  6. Po potvrzení se hráči přidají do klubu
 *
 * RČ se nikdy neimportuje (řešeno v parseru přes HEADER_PATTERNS.ignore).
 */

import { useState } from 'react';
import type { Club, AgeCategory, ClubPlayer } from '../../types/club.types';
import { AGE_CATEGORIES } from '../../types/club.types';
import {
  parseRosterFile,
  mapRows,
  buildPlayerName,
  type ParsedWorkbook,
  type ParsedSheet,
  type ImportField,
  type ImportColumn,
} from '../../utils/roster-import';
import { useI18n } from '../../i18n';

interface Props {
  club: Club;
  onClose: () => void;
  onImport: (players: Omit<ClubPlayer, 'id'>[]) => void;
}

const FIELD_LABELS: Record<ImportField, string> = {
  externalId: 'ID',
  firstName: 'Jméno',
  lastName: 'Příjmení',
  fullName: 'Celé jméno',
  jerseyNumber: 'Číslo dresu',
  birthYear: 'Ročník',
  birthDate: 'Datum narození',
  position: 'Pozice',
  phone: 'Telefon',
  email: 'E-mail',
  ignore: '— ignorovat —',
};

export function ImportPlayersModal({ club, onClose, onImport }: Props) {
  const { t } = useI18n();
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [activeSheet, setActiveSheet] = useState<ParsedSheet | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [targetCategory, setTargetCategory] = useState<AgeCategory>(
    club.ageCategories[0] ?? 'U10',
  );
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setError('');
    try {
      const wb = await parseRosterFile(file);
      if (wb.sheets.length === 0) {
        setError(t('clubs.import.errEmpty'));
        return;
      }
      // Najdi list, který vypadá jako hráči (ne trenéři)
      const playersIdx = wb.sheets.findIndex(s =>
        /hr[áa][čc]/i.test(s.sheetName) || /player/i.test(s.sheetName),
      );
      const idx = playersIdx >= 0 ? playersIdx : 0;
      setWorkbook(wb);
      setActiveSheetIdx(idx);
      setActiveSheet(wb.sheets[idx]);
      // Pre-select všechny řádky
      setSelectedRows(new Set(wb.sheets[idx].rows.map(r => r._rawIndex)));
    } catch (err) {
      console.error('[Import] Parse failed:', err);
      setError(t('clubs.import.errParse'));
    } finally {
      setParsing(false);
    }
  };

  const switchSheet = (idx: number) => {
    if (!workbook) return;
    setActiveSheetIdx(idx);
    setActiveSheet(workbook.sheets[idx]);
    setSelectedRows(new Set(workbook.sheets[idx].rows.map(r => r._rawIndex)));
  };

  const updateColumnMapping = (colIdx: number, field: ImportField) => {
    if (!activeSheet || !workbook) return;
    const newColumns: ImportColumn[] = activeSheet.columns.map((c, i) =>
      i === colIdx ? { ...c, field } : c,
    );
    const newRows = mapRows(activeSheet.rawRows, newColumns);
    const updated: ParsedSheet = { ...activeSheet, columns: newColumns, rows: newRows };
    setActiveSheet(updated);
    const newSheets = workbook.sheets.map((s, i) => (i === activeSheetIdx ? updated : s));
    setWorkbook({ ...workbook, sheets: newSheets });
    setSelectedRows(new Set(newRows.map(r => r._rawIndex)));
  };

  const toggleRow = (rawIdx: number) => {
    const next = new Set(selectedRows);
    if (next.has(rawIdx)) next.delete(rawIdx);
    else next.add(rawIdx);
    setSelectedRows(next);
  };

  const toggleAll = () => {
    if (!activeSheet) return;
    if (selectedRows.size === activeSheet.rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(activeSheet.rows.map(r => r._rawIndex)));
    }
  };

  const handleConfirmImport = () => {
    if (!activeSheet || !workbook) return;
    const today = new Date().toISOString().slice(0, 10);
    const source = activeSheet.detectedSource === 'unknown' ? 'manual' : activeSheet.detectedSource;

    // Existující externalId v klubu (pro deduplikaci)
    const existingExtIds = new Set(
      (club.players ?? [])
        .filter(p => p.externalId)
        .map(p => p.externalId!),
    );

    const players: Omit<ClubPlayer, 'id'>[] = [];

    for (const row of activeSheet.rows) {
      if (!selectedRows.has(row._rawIndex)) continue;
      // Skip pokud existuje stejné externalId
      if (row.externalId && existingExtIds.has(row.externalId)) continue;

      players.push({
        externalId: row.externalId,
        externalSource: source,
        name: buildPlayerName(row),
        firstName: row.firstName,
        lastName: row.lastName,
        jerseyNumber: row.jerseyNumber ?? 0,
        birthYear: row.birthYear ?? null,
        birthDate: row.birthDate,
        position: row.position,
        phone: row.phone,
        email: row.email,
        ageCategory: targetCategory,
        categoryHistory: [{ category: targetCategory, from: today }],
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    onImport(players);
    onClose();
  };

  const detectedLabel = activeSheet?.detectedSource === 'eos' ? '✅ EOS'
    : activeSheet?.detectedSource === 'xps' ? '✅ XPS'
    : '⚠ ' + t('clubs.import.unknownFormat');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 18,
          width: '100%', maxWidth: 720, maxHeight: '90dvh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,.3)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>📥</span>
          <h2 style={{ flex: 1, fontWeight: 800, fontSize: 17, margin: 0 }}>
            {t('clubs.import.title')}
          </h2>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, background: 'var(--surface-var)',
              fontSize: 16, color: 'var(--text-muted)', border: 'none', cursor: 'pointer',
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {/* Krok 1: Vybrat soubor */}
          {!workbook && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                {t('clubs.import.intro')}
              </p>
              <ul style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0, paddingLeft: 20 }}>
                <li>{t('clubs.import.supportEos')}</li>
                <li>{t('clubs.import.supportXps')}</li>
                <li>{t('clubs.import.supportGeneric')}</li>
              </ul>
              <div style={{
                background: '#FFF8E1', border: '1px solid #FFE082',
                borderRadius: 10, padding: '10px 14px',
                fontSize: 12, color: '#BF360C', lineHeight: 1.5,
              }}>
                🔒 {t('clubs.import.privacyNote')}
              </div>
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '20px', borderRadius: 14,
                background: 'var(--primary-light)', color: 'var(--primary)',
                border: '2px dashed var(--primary)', cursor: 'pointer',
                fontWeight: 700, fontSize: 15,
              }}>
                <span style={{ fontSize: 24 }}>📁</span>
                {parsing ? t('common.loading') : t('clubs.import.selectFile')}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFile}
                  disabled={parsing}
                  style={{ display: 'none' }}
                />
              </label>
              {error && (
                <div style={{
                  background: '#FFEBEE', color: '#B71C1C', padding: '10px 14px',
                  borderRadius: 10, fontSize: 13, fontWeight: 600,
                }}>{error}</div>
              )}
            </div>
          )}

          {/* Krok 2: Preview */}
          {workbook && activeSheet && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Sheet selector + detected format */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                  {workbook.fileName}
                </span>
                <span style={{
                  background: 'var(--surface-var)', borderRadius: 6,
                  padding: '3px 10px', fontSize: 11, fontWeight: 700,
                  color: 'var(--text-muted)',
                }}>{detectedLabel}</span>
                {workbook.sheets.length > 1 && (
                  <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                    {workbook.sheets.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => switchSheet(i)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: i === activeSheetIdx ? 'var(--primary)' : 'var(--surface-var)',
                          color: i === activeSheetIdx ? '#fff' : 'var(--text-muted)',
                          border: 'none', cursor: 'pointer',
                        }}
                      >{s.sheetName} ({s.rows.length})</button>
                    ))}
                  </div>
                )}
              </div>

              {/* Cílová kategorie */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {t('clubs.import.targetCategory')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {AGE_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setTargetCategory(cat)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: targetCategory === cat ? 'var(--primary)' : 'var(--surface-var)',
                        color: targetCategory === cat ? '#fff' : 'var(--text-muted)',
                        border: 'none', cursor: 'pointer',
                      }}
                    >{cat}</button>
                  ))}
                </div>
              </div>

              {/* Column mapping (collapsible) */}
              <details style={{ background: 'var(--surface-var)', borderRadius: 10, padding: '10px 14px' }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  ⚙ {t('clubs.import.columnMapping')}
                </summary>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activeSheet.columns.map((col, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{
                        flex: 1, fontWeight: 600, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {col.header || `(col ${i + 1})`}
                        {col.sampleValues.length > 0 && (
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                            → {col.sampleValues[0]}
                          </span>
                        )}
                      </span>
                      <select
                        value={col.field}
                        onChange={e => updateColumnMapping(i, e.target.value as ImportField)}
                        style={{
                          padding: '4px 8px', borderRadius: 6, fontSize: 12,
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          color: 'var(--text)',
                        }}
                      >
                        {(Object.keys(FIELD_LABELS) as ImportField[]).map(f => (
                          <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </details>

              {/* Preview tabulka */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                    {t('clubs.import.preview')} ({selectedRows.size}/{activeSheet.rows.length})
                  </span>
                  <button
                    onClick={toggleAll}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: 'var(--surface-var)', color: 'var(--text)',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    {selectedRows.size === activeSheet.rows.length
                      ? t('clubs.import.deselectAll')
                      : t('clubs.import.selectAll')}
                  </button>
                </div>
                <div style={{
                  border: '1px solid var(--border)', borderRadius: 10,
                  maxHeight: 320, overflowY: 'auto',
                }}>
                  {activeSheet.rows.length === 0 && (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      {t('clubs.import.noPlayers')}
                    </div>
                  )}
                  {activeSheet.rows.map(row => {
                    const checked = selectedRows.has(row._rawIndex);
                    const name = buildPlayerName(row);
                    return (
                      <label
                        key={row._rawIndex}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          background: checked ? 'transparent' : 'var(--surface-var)',
                          opacity: checked ? 1 : 0.55,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(row._rawIndex)}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                            {row.birthYear && <span>{row.birthYear}</span>}
                            {row.position && <span>· {row.position}</span>}
                            {row.email && <span>· ✉ {row.email}</span>}
                            {row.phone && <span>· 📞 {row.phone}</span>}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {workbook && activeSheet && (
          <div style={{
            padding: '14px 22px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: 10, justifyContent: 'flex-end',
          }}>
            <button
              onClick={onClose}
              style={{
                padding: '10px 18px', borderRadius: 10, fontWeight: 600, fontSize: 14,
                background: 'var(--surface-var)', color: 'var(--text)',
                border: 'none', cursor: 'pointer',
              }}
            >{t('common.cancel')}</button>
            <button
              onClick={handleConfirmImport}
              disabled={selectedRows.size === 0}
              style={{
                padding: '10px 18px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                background: selectedRows.size === 0 ? 'var(--border)' : 'var(--primary)',
                color: '#fff', border: 'none',
                cursor: selectedRows.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {t('clubs.import.importBtn', { count: selectedRows.size })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
