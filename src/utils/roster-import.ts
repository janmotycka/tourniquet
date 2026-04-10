/**
 * Roster import utility — parsuje XLSX/CSV exporty hráčů z různých platforem
 * (EOS, XPS, generický mapper) a vrací jednotnou strukturu připravenou
 * k importu do klubu.
 *
 * Důležité: rodné číslo (RČ) se NIKDY nepřebírá z importu — je to citlivé osobní
 * údaje a parser ho explicitně vynechává.
 */

import * as XLSX from 'xlsx';

// ─── Typy ──────────────────────────────────────────────────────────────────

export type ImportField =
  | 'externalId'
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'jerseyNumber'
  | 'birthYear'
  | 'birthDate'
  | 'position'
  | 'phone'
  | 'email'
  | 'ignore';

export interface ImportColumn {
  index: number;          // pozice v původním sheetu (0-based)
  header: string;         // text hlavičky
  field: ImportField;     // jak ji namapovat
  sampleValues: string[]; // první 3 neprázdné hodnoty (pro UI)
}

export interface ImportRow {
  externalId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;      // pokud neznáme firstName/lastName
  jerseyNumber?: number;
  birthYear?: number;
  birthDate?: string;     // ISO YYYY-MM-DD
  position?: string;
  phone?: string;
  email?: string;
  // Surová data pro debug / preview:
  _rawIndex: number;
}

export interface ParsedSheet {
  sheetName: string;
  columns: ImportColumn[];
  rows: ImportRow[];      // už namapované podle columns
  rawRows: string[][];    // surové buňky pro fallback
  detectedSource: 'eos' | 'xps' | 'unknown';
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
  fileName: string;
}

// ─── Heuristiky pro auto-detekci ───────────────────────────────────────────

const HEADER_PATTERNS: Record<ImportField, RegExp[]> = {
  externalId: [/^id$/i, /^player.?id$/i, /^uuid$/i],
  firstName: [/^j[mé]no$/i, /^jm[eé]no$/i, /^first.?name$/i, /^vorname$/i, /^křestní/i, /^k[řr]estn[íi]/i],
  lastName: [/^p[řr][íi]jmen[íi]$/i, /^last.?name$/i, /^surname$/i, /^nachname$/i],
  fullName: [/^jm[ée]no.*p[řr]íjmen/i, /^full.?name$/i, /^name$/i, /^hr[áa][čc]/i],
  jerseyNumber: [/^[čc][íi]slo$/i, /^number$/i, /^dres/i, /^jersey/i, /^#$/],
  birthYear: [/^ro[čc]n[íi]k$/i, /^year$/i, /^year.?of.?birth$/i],
  birthDate: [/^datum.*naroz/i, /^birth.?date$/i, /^geburtsdatum$/i, /^dob$/i],
  position: [/^pozice$/i, /^position$/i, /^post$/i],
  phone: [/^tel/i, /^phone/i, /^mobil/i],
  email: [/^e.?mail/i, /^mail$/i],
  ignore: [
    /^r[čc]$/i, /^rodn[ée].?[čc][íi]slo$/i, /^national.?id$/i,  // RČ — VŽDY ignorovat
    /^druh[ée].?jm[ée]no$/i, /^middle.?name$/i,                  // střední jméno — neukládáme
    /^podskup/i, /^subgroup/i,
  ],
};

function detectField(header: string): ImportField {
  // Strip BOM, zero-width chars, trim whitespace
  const h = header.replace(/[\uFEFF\u200B\u200C\u200D\u00A0]/g, '').trim();
  if (!h) return 'ignore';
  for (const [field, patterns] of Object.entries(HEADER_PATTERNS) as [ImportField, RegExp[]][]) {
    if (patterns.some(p => p.test(h))) return field;
  }
  return 'ignore';
}

function detectSource(headers: string[]): ParsedSheet['detectedSource'] {
  const lower = headers.map(h => h.toLowerCase().trim());
  // EOS (Czech FA) — má id, Pozice, Číslo, Příjmení, Jméno, Druhé jméno, RČ
  if (
    lower.includes('id') &&
    lower.some(h => h.includes('příjmení') || h.includes('prijmeni')) &&
    lower.some(h => h.includes('jméno') || h.includes('jmeno')) &&
    (lower.includes('rč') || lower.some(h => h.includes('rodn')))
  ) {
    return 'eos';
  }
  // XPS network — typicky má "Player Name", "Birth Date", "Position", "Email"
  if (
    lower.some(h => h === 'first name' || h === 'firstname') &&
    lower.some(h => h === 'last name' || h === 'lastname') &&
    lower.some(h => h.includes('birth') || h.includes('dob'))
  ) {
    return 'xps';
  }
  return 'unknown';
}

// ─── Pomocné convertery hodnot ─────────────────────────────────────────────

function cleanCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value).trim();
  // EOS používá "#N/A" jako placeholder pro chybějící hodnoty
  if (s === '#N/A' || s === '-' || s === 'null' || s === 'NULL') return '';
  return s;
}

function parseJerseyNumber(s: string): number | undefined {
  const n = parseInt(s.replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n >= 0 && n <= 999 ? n : undefined;
}

function parseBirthYear(s: string): number | undefined {
  // Buď čtyřciferný rok ("2015"), nebo datum z něhož vytáhneme rok
  const match = s.match(/(19|20)\d{2}/);
  if (!match) return undefined;
  const y = parseInt(match[0], 10);
  return y >= 1900 && y <= new Date().getFullYear() ? y : undefined;
}

function parseBirthDate(s: string): string | undefined {
  // Excel uloží datum jako serial number, ale my pracujeme s text reprezentací.
  // Akceptujeme: YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY, MM/DD/YYYY (méně pravděpodobné)
  if (!s) return undefined;
  // ISO
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD.MM.YYYY
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // DD/MM/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}

function parsePhone(s: string): string | undefined {
  if (!s) return undefined;
  // Zachováme + a číslice/mezery
  const cleaned = s.replace(/[^\d+\s]/g, '').trim();
  return cleaned.length >= 9 ? cleaned : undefined;
}

function parseEmail(s: string): string | undefined {
  if (!s) return undefined;
  const lower = s.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower) ? lower : undefined;
}

// ─── Hlavní parser ─────────────────────────────────────────────────────────

/**
 * Načte XLSX/CSV soubor a vrátí strukturu připravenou k importu.
 * Auto-detekuje známé formáty (EOS, XPS) a předmapuje sloupce.
 * Pro neznámé formáty uživatel namapuje sloupce ručně přes UI.
 */
export async function parseRosterFile(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });

  const sheets: ParsedSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    // Načteme jako pole polí (každý řádek = pole stringů)
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: '',
      raw: false, // formátované hodnoty (data jako text)
    }).map(row => row.map(cleanCell));

    if (rawRows.length === 0) continue;

    const headerRow = rawRows[0] ?? [];
    const dataRows = rawRows.slice(1);

    // Sloupce s auto-mapováním
    const columns: ImportColumn[] = headerRow.map((header, index) => {
      const sampleValues = dataRows
        .map(r => r[index])
        .filter((v): v is string => Boolean(v))
        .slice(0, 3);
      return {
        index,
        header,
        field: detectField(header),
        sampleValues,
      };
    });

    const detectedSource = detectSource(headerRow);

    // EOS fixup: pokud detekováno jako EOS ale firstName chybí, zkus přiřadit ručně
    if (detectedSource === 'eos') {
      const hasFirstName = columns.some(c => c.field === 'firstName');
      if (!hasFirstName) {
        // Hledej sloupec jehož hlavička obsahuje "jm" a není lastName/fullName
        for (const col of columns) {
          const norm = col.header.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
          if ((norm === 'jmeno' || norm === 'jméno') && col.field === 'ignore') {
            col.field = 'firstName';
            break;
          }
        }
      }
    }

    // Pre-mapování řádků na ImportRow podle aktuálního column mappingu
    const rows = mapRows(dataRows, columns);

    sheets.push({
      sheetName,
      columns,
      rows,
      rawRows: dataRows,
      detectedSource,
    });
  }

  return { sheets, fileName: file.name };
}

/**
 * Aplikuje aktuální column mapping na surová data → ImportRow[].
 * Volá se i opakovaně po každé změně mapování v UI.
 */
export function mapRows(rawRows: string[][], columns: ImportColumn[]): ImportRow[] {
  const out: ImportRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const result: ImportRow = { _rawIndex: i };

    for (const col of columns) {
      if (col.field === 'ignore') continue;
      const raw = row[col.index] ?? '';
      if (!raw) continue;

      switch (col.field) {
        case 'externalId':
          result.externalId = raw;
          break;
        case 'firstName':
          result.firstName = raw;
          break;
        case 'lastName':
          result.lastName = raw;
          break;
        case 'fullName':
          result.fullName = raw;
          break;
        case 'jerseyNumber': {
          const n = parseJerseyNumber(raw);
          if (n !== undefined) result.jerseyNumber = n;
          break;
        }
        case 'birthYear': {
          const y = parseBirthYear(raw);
          if (y !== undefined) result.birthYear = y;
          break;
        }
        case 'birthDate': {
          const d = parseBirthDate(raw);
          if (d !== undefined) {
            result.birthDate = d;
            // Z birthDate vyextrahujeme i birthYear, pokud chybí
            if (!result.birthYear) {
              result.birthYear = parseInt(d.slice(0, 4), 10);
            }
          }
          break;
        }
        case 'position':
          result.position = raw;
          break;
        case 'phone': {
          const p = parsePhone(raw);
          if (p) result.phone = p;
          break;
        }
        case 'email': {
          const e = parseEmail(raw);
          if (e) result.email = e;
          break;
        }
      }
    }

    // Řádek je validní jen pokud má alespoň jméno
    const hasName = result.firstName || result.lastName || result.fullName;
    if (hasName) out.push(result);
  }

  return out;
}

/**
 * Spojí firstName + lastName do canonical `name` (nebo použije `fullName`).
 */
export function buildPlayerName(row: ImportRow): string {
  if (row.firstName && row.lastName) {
    return `${row.firstName} ${row.lastName}`.trim();
  }
  if (row.fullName) return row.fullName.trim();
  return (row.lastName || row.firstName || '').trim();
}
