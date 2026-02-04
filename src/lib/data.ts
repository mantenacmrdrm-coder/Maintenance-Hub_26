









import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isoWeek from 'dayjs/plugin/isoWeek';
import csv from 'csv-parser';
import iconv from 'iconv-lite';
import { OFFICIAL_ENTRETIENS, HEADER_ORDER, planningOperationNameMapping } from '@/lib/constants';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import type { PreventativeMaintenanceEntry, CurativeMaintenanceEntry, WeeklyReport, WeeklyReportItem, MonthlyCount, MonthlyPreventativeStats, DeclarationPanne } from '@/lib/types';
import { Readable } from 'stream';

dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(customParseFormat);
dayjs.extend(isoWeek);

const getVal = (row: any, ...keys: string[]): any => {
    for (const key of keys) {
        if (row[key] !== undefined) return row[key];
    }
    return undefined;
}

const entretienSynonyms: { [synonym: string]: (typeof OFFICIAL_ENTRETIENS)[number] } = {
    'liquide refroidissement': 'Etanchéité de tous les circuits'
};

function findMatchedEntretien(piece: string): (typeof OFFICIAL_ENTRETIENS)[number] | undefined {
    const normalizedPiece = normalize(piece);

    // 1. Check for synonyms
    for (const synonym in entretienSynonyms) {
        const synonymWords = synonym.split(' ').map(w => normalize(w)).filter(Boolean);
        if (synonymWords.length > 0 && synonymWords.every(word => normalizedPiece.includes(word))) {
            return entretienSynonyms[synonym];
        }
    }

    // 2. Generic matching against official list, prioritizing longer, more specific matches
    const sortedEntretiens = [...OFFICIAL_ENTRETIENS].sort((a, b) => b.length - a.length);

    for (const entretien of sortedEntretiens) {
        // We already handled this via synonyms
        if (entretien === 'Etanchéité de tous les circuits') {
            continue;
        }

        const entretienWords = entretien.split(' ').map(w => normalize(w)).filter(Boolean);
        if (entretienWords.length === 0) continue;

        if (entretienWords.every(word => normalizedPiece.includes(word))) {
            return entretien;
        }
    }
    
    return undefined;
}

let historyCache: { headers: readonly string[]; rows: (string | null)[][]; } | null = null;
let historyCacheTimestamp: number | null = null;
const DB_PATH = path.join(process.cwd(), 'gmao_data.db');

const normalize = (str: string | null | undefined): string => {
    if (!str) return '';
    return str.toString().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9]/g, '');
};

const getDb = async () => {
  return open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });
};

const withDb = async <T>(operation: (db: Awaited<ReturnType<typeof getDb>>) => Promise<T>): Promise<T> => {
    let db: Awaited<ReturnType<typeof getDb>> | null = null;
    try {
        db = await getDb();
        return await operation(db);
    } catch (error) {
        console.error('Database operation failed:', error);
        throw error;
    } finally {
        await db?.close();
    }
};

const runAsync = (db: Database, sql: string, params: any[] = []): Promise<{ lastID: number, changes: number }> => {
    return db.run(sql, params).then(result => ({
        lastID: result.lastID ?? 0,
        changes: result.changes ?? 0
    }));
};

const allAsync = (db: Database, sql: string, params: any[] = []): Promise<any[]> => {
    return db.all(sql, params);
};

const parseCsv = async (buffer: Buffer): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const rows: any[] = [];
    const stream = Readable.from(buffer);
    stream
      .pipe(iconv.decodeStream('utf-8')) // <-- changement ici
      .pipe(csv({ 
          separator: ';',
          mapHeaders: ({ header }) => header.trim().replace(/\s+/g, '_').replace(/[."(),/]/g, '').toLowerCase() || null
      }))
      .on('data', (data) => rows.push(data))
      .on('end', () => resolve(rows))
      .on('error', (error) => reject(error));
  });
};

const importCsvToTable = async (db: Awaited<ReturnType<typeof getDb>>, tableName: string, csvFileName: string) => {
  await db.exec(`DROP TABLE IF EXISTS "${tableName}"`);
  const absPath = path.join(process.cwd(), 'public', 'import', csvFileName);
  let rows;
  try {
      const fileBuffer = await fs.readFile(absPath);
      rows = await parseCsv(fileBuffer);
  } catch (e: any) {
    throw new Error(`Could not read file ${csvFileName}. Make sure it exists in public/import. Original error: ${e.message}`);
  }
  if (!rows || rows.length === 0) {
    return `No data found in ${csvFileName}. Skipping table creation.`;
  }
  const headers = Object.keys(rows[0]).filter(h => h && h !== 'null');
  if (headers.length === 0) {
    throw new Error(`Could not determine headers for ${csvFileName}`);
  }
  try {
    const createColumns = headers.map(h => `"${h}" TEXT`).join(', ');
    await db.exec(`CREATE TABLE "${tableName}" (id INTEGER PRIMARY KEY AUTOINCREMENT, ${createColumns})`);
    const insertPlaceholders = headers.map(() => '?').join(', ');
    const insertSql = `INSERT INTO "${tableName}" (${headers.map(h => `"${h}"`).join(', ')}) VALUES (${insertPlaceholders})`;
    await db.exec('BEGIN TRANSACTION');
    const stmt = await db.prepare(insertSql);
    for (const row of rows) {
      const values = headers.map(h => row[h] ?? null);
      await stmt.run(values);
    }
    await stmt.finalize();
    await db.exec('COMMIT');
    return `Imported ${rows.length} rows into new table ${tableName}.`;
  } catch (dbError: any) {
    console.error(`DB Error for ${tableName}:`, dbError);
    await db.exec('ROLLBACK');
    throw new Error(`Failed to import ${tableName}: ${dbError.message}`);
  }
};

export async function initializeDatabase() {
    try {
        return await withDb(async (db) => {
             const EXCLUSIONS_NORM: Record<string, Set<string>> = {
                geg: new Set(['frein', 'chaine', 'pneu', 'moyeuderoue', 'graissagegeneral', 'boitedevitesse', 'cardan', 'embrayage', 'circuithydraulique', 'pompehydraulique', 'filtrehydraulique', 'reservoirhydraulique', 'faisceauxelectriques']),
                outillagedivers: new Set(['courroie', 'filtreahuile', 'vidangerlecartermoteur', 'filtreaair', 'filtrecarburant', 'soupape', 'alternateur', 'batterie', 'frein', 'chaine', 'pneu', 'moyeuderoue', 'graissagegeneral', 'boitedevitesse', 'cardan', 'embrayage', 'circuithydraulique', 'pompehydraulique', 'filtrehydraulique', 'reservoirhydraulique', 'faisceauxelectriques']),
                aircomprime: new Set(['frein', 'chaine', 'pneu', 'moyeuderoue', 'graissagegeneral', 'boitedevitesse', 'cardan', 'embrayage', 'circuithydraulique', 'pompehydraulique', 'faisceauxelectriques']),
                transmarchandise1: new Set(['niveaudhuileducarter', 'etanchitedetouslescircuits', 'courroie', 'filtreahuile', 'vidangerlecartermoteur', 'filtreaair', 'filtrecarburant', 'chaine', 'soupape', 'boitedevitesse', 'cardan', 'embrayage', 'circuithydraulique', 'pompehydraulique', 'filtrehydraulique', 'reservoirhydraulique', 'alternateur', 'batterie', 'faisceauxelectriques']),
                transetvspeciaux1: new Set(['niveaudhuileducarter', 'etanchitedetouslescircuits', 'courroie', 'filtreahuile', 'vidangerlecartermoteur', 'filtreaair', 'filtrecarburant', 'chaine', 'soupape', 'boitedevitesse', 'cardan', 'embrayage', 'circuithydraulique', 'pompehydraulique', 'filtrehydraulique', 'reservoirhydraulique', 'alternateur', 'batterie', 'faisceauxelectriques']),
                transpersonnel: new Set(['niveaudhuileducarter', 'circuithydraulique', 'pompehydraulique', 'filtrehydraulique', 'reservoirhydraulique', 'faisceauxelectriques']),
                transbenner: new Set(['embrayage', 'chaine', 'boitedevitesse', 'alternateur', 'faisceauxelectriques']),
                legeree: new Set(['graissagegeneral', 'circuithydraulique', 'pompehydraulique', 'filtrehydraulique', 'reservoirhydraulique']),
                legerd: new Set(['graissagegeneral', 'circuithydraulique', 'pompehydraulique', 'filtrehydraulique', 'reservoirhydraulique', 'faisceauxelectriques']),
                transforbeton: new Set(['frein', 'chaine', 'pneu', 'moyeuderoue', 'boitedevitesse', 'cardan', 'embrayage', 'circuithydraulique', 'pompehydraulique', 'filtrehydraulique', 'reservoirhydraulique', 'faisceauxelectriques']),
                manutention1: new Set(['filtreahuile', 'vidangerlecartermoteur', 'filtreaair', 'filtrecarburant', 'soupape', 'alternateur', 'frein', 'chaine', 'pneu', 'moyeuderoue', 'cardan', 'embrayage', 'circuithydraulique', 'pompehydraulique', 'filtrehydraulique', 'reservoirhydraulique', 'faisceauxelectriques']),
            };
            
            const messages = [];
            console.log('🚀 Début de l\'initialisation de la base de données...');
            
            const csvFiles = ['matrice.csv', 'Param.csv', 'vidange.csv', 'suivi_curatif.csv', 'consolide.csv'];
            for (const file of csvFiles) {
                try {
                    const tableName = file.replace('.csv', '');
                    const msg = await importCsvToTable(db, tableName, file);
                    messages.push(msg);
                } catch (error: any) {
                    console.error(`❌ Erreur avec ${file}:`, error.message);
                    messages.push(`Error with ${file}: ${error.message}`);
                }
            }
            
            try {
              const planningMsg = await createPlanningCacheTable(db);
              messages.push(planningMsg);
            } catch (error: any) {
              messages.push(`Planning cache error: ${error.message}`);
            }
            try {
                const historyMsg = await createHistoryCacheTable(db);
                messages.push(historyMsg);
            } catch (error: any) {
                messages.push(`History cache error: ${error.message}`);
            }

            try {
                await db.exec(`
                    CREATE TABLE IF NOT EXISTS category_entretiens (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        category TEXT NOT NULL,
                        entretien TEXT NOT NULL,
                        is_active INTEGER DEFAULT 1 NOT NULL,
                        UNIQUE(category, entretien)
                    )
                `);

                const categories = (await db.all('SELECT DISTINCT categorie FROM matrice')).map(r => r.categorie).filter(Boolean);
                const insertStmt = await db.prepare('INSERT OR IGNORE INTO category_entretiens (category, entretien, is_active) VALUES (?, ?, ?)');

                await db.run('BEGIN TRANSACTION');
                for (const category of categories) {
                    const categoryNorm = normalize(category || '').replace(/,/g, '');
                    const exclusions = EXCLUSIONS_NORM[categoryNorm] || new Set();

                    for (const entretien of OFFICIAL_ENTRETIENS) {
                        const entretienNorm = normalize(entretien);
                        const isActive = !exclusions.has(entretienNorm);
                        await insertStmt.run(category, entretien, isActive ? 1 : 0);
                    }
                }
                await insertStmt.finalize();
                await db.run('COMMIT');
                messages.push('Table category_entretiens created and populated.');
            } catch (error: any) {
                messages.push(`Category/Entretien setup error: ${error.message}`);
            }
            
            try {
                await db.exec(`
                    CREATE TABLE IF NOT EXISTS weekly_reports (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        start_date TEXT NOT NULL,
                        end_date TEXT NOT NULL,
                        generated_at TEXT NOT NULL,
                        report_data_json TEXT NOT NULL
                    )
                `);
                messages.push('Table weekly_reports created.');
            } catch (error: any) {
                messages.push(`Weekly reports table creation error: ${error.message}`);
            }

            try {
                await db.exec(`
                    CREATE TABLE IF NOT EXISTS declarations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        operation_id INTEGER NOT NULL,
                        generated_at TEXT NOT NULL,
                        report_data_json TEXT NOT NULL,
                        FOREIGN KEY (operation_id) REFERENCES suivi_curatif(id)
                    )
                `);
                messages.push('Table declarations created.');
            } catch (error: any) {
                messages.push(`Declarations table creation error: ${error.message}`);
            }

            return { success: true, message: `Database initialization complete. ${messages.join(' ')}` };
        });
    } catch(e: any) {
        return { success: false, message: `Database file could not be created or opened. ${e.message}` };
    }
}

export async function getAllEquipment(): Promise<any[]> {
    try {
        return await withDb(async (db) => {
            return await db.all('SELECT * FROM matrice');
        });
    } catch (e: any) {
        if (e.code === 'SQLITE_ERROR' && e.message.includes('no such table')) {
            console.warn("Table 'matrice' not found. The database might not be initialized.");
        } else {
            console.error("An error occurred in getAllEquipment:", e.message);
        }
        return [];
    }
}

export async function getAllOperations(): Promise<any[]> {
    try {
        return await withDb(async (db) => {
            // This query now only selects curative operations that do NOT have an associated declaration.
            const rows = await db.all(`
            SELECT 
                sc.*,
                m.designation
            FROM suivi_curatif sc
            LEFT JOIN matrice m ON sc.matricule = m.matricule
            LEFT JOIN declarations d ON sc.id = d.operation_id
            WHERE d.id IS NULL
            ORDER BY 
                substr(sc.date_entree, 7, 4) DESC, 
                substr(sc.date_entree, 4, 2) DESC, 
                substr(sc.date_entree, 1, 2) DESC, 
                sc.id DESC
            `);
            
            return rows.map(row => ({
                ...row, // Keep all original fields
                operation: row.panne_declaree || row.pieces || 'Opération non spécifiée',
                date_programmee: row.date_entree,
                date_realisation: row.date_sortie,
                nature: row.type_de_panne || 'non spécifié',
                niveau: 'Curatif'
            }));
        });
    } catch (e: any) {
        if (e.code === 'SQLITE_ERROR' && e.message.includes('no such table')) {
            console.warn("Table 'suivi_curatif' or 'declarations' not found. The database might not be initialized.");
        } else {
            console.error("An error occurred in getAllOperations:", e.message);
        }
        return [];
    }
}

const createHistoryCacheTable = async (db: Awaited<ReturnType<typeof getDb>>): Promise<string> => {
    try {
        await db.exec(`
            CREATE TABLE IF NOT EXISTS history_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                matricule TEXT,
                operation TEXT,
                date TEXT,
                releve_compteur REAL,
                source TEXT
            )
        `);
        await db.exec('CREATE INDEX IF NOT EXISTS idx_history_cache_matricule ON history_cache(matricule)');
        return 'Table history_cache created or verified successfully.';
    } catch(error: any) {
        throw new Error(`Failed to create history_cache table: ${error.message}`);
    }
  };
  
  function extraireReleve(txt: any): number | null {
    if (!txt) return null;
    const cleaned = txt.toString().replace(/[^0-9]/g, ' ');
    const tokens = cleaned.trim().split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const num = parseInt(token, 10);
      if (!isNaN(num) && num > 10) {
        return num;
      }
    }
    return null;
  }
  
  const parseDateSafe = (dateStr: any) => {
      if (!dateStr || typeof dateStr !== 'string') return null;
      const date = dayjs(dateStr.trim(), ['DD/MM/YYYY', 'D/M/YYYY', 'YYYY-MM-DD HH:mm:ss'], true);
      return date.isValid() ? date.format('DD/MM/YYYY') : null;
  };
  
export async function generateHistoryMatrix() {
  return withDb(async (db) => {
      await createHistoryCacheTable(db);
      console.log('📜 [DEBUG] Démarrage de la génération de l\'historique unifié...');
      
      const allOperations: {
          matricule: string;
          operation: string;
          date: string;
          releve: number | null;
          source: string;
      }[] = [];

      // 1. CURATIF
      const suiviData = await db.all('SELECT * FROM suivi_curatif');
      for (const row of suiviData) {
          const matricule = row.matricule?.toString().trim();
          const date = parseDateSafe(row.date_entree);
          if (!matricule || !date) continue;
          
          let pieces = row.pieces?.toLowerCase();
          if (!pieces) continue;

          if (pieces.startsWith('remplacement de ') || pieces.startsWith('changement de ')) {
              pieces = pieces.substring(pieces.indexOf(' de ') + 4);
          }
          const piecesList = pieces.split('-').map(p => p.trim()).filter(Boolean);
          
          const releve = extraireReleve(row.panne_declaree);

          for (const piece of piecesList) {
             const matchedEntretien = findMatchedEntretien(piece);
            if (matchedEntretien) {
                allOperations.push({ matricule, operation: matchedEntretien, date, releve, source: 'suivi_curatif' });
            }
          }
      }

      // 2. VIDANGE
      const vidanges = await db.all('SELECT * FROM vidange');
      for (const r of vidanges) {
          const matricule = r.matricule?.toString().trim();
          const dateStr = getVal(r, 'date', 'date_entretien');
          const date = parseDateSafe(dateStr);
          if (!matricule || !date) continue;
          
          const counterStr = getVal(r, 'compteur_kmh', 'compteur_km_h');
          const releve = extraireReleve(counterStr);
          
          allOperations.push({ matricule, operation: 'Vidanger le carter moteur', date, releve, source: 'vidange' });
          
          const flag = (v: any) => typeof v === 'string' && ['*', '**'].includes(v.trim());
          const obs = (r.obs || '').toUpperCase();
          const rowKeys = Object.keys(r);

          const fhKey = rowKeys.find(k => k === 'fh' || k === 'f_h');
          const fgKey = rowKeys.find(k => k === 'fg' || k === 'f_g');
          const fairKey = rowKeys.find(k => k === 'fair' || k === 'f_air');
          const fhydKey = rowKeys.find(k => k === 'fhyd' || k === 'f_hyd');

          if ((fhKey && flag(r[fhKey])) || obs.includes('FH')) allOperations.push({ matricule, operation: 'Filtre à huile', date, releve, source: 'vidange' });
          if ((fgKey && flag(r[fgKey])) || obs.includes('FG')) allOperations.push({ matricule, operation: 'Filtre carburant', date, releve, source: 'vidange' });
          if ((fairKey && flag(r[fairKey])) || obs.includes('FAIR')) allOperations.push({ matricule, operation: 'Filtre à air', date, releve, source: 'vidange' });
          if ((fhydKey && flag(r[fhydKey])) || obs.includes('FHYD')) allOperations.push({ matricule, operation: 'Filtre hydraulique', date, releve, source: 'vidange' });
          if (obs.includes('CHAINE')) allOperations.push({ matricule, operation: 'chaine', date, releve, source: 'vidange' });
      }

      // 3. CONSOLIDE
      const consolideData = await db.all('SELECT * FROM consolide');
      for (const row of consolideData) {
          const matricule = row.matricule?.toString().trim();
          if (!matricule) continue;

          const date = parseDateSafe(row['date']);
          if (!date) continue;
          
          const entretienCode = row['entretien']?.toString().trim().toUpperCase();
          const obsText = row['obs']?.toString().trim() || '';
          const releve = extraireReleve(obsText);

          let officialOperationName: string | undefined = (planningOperationNameMapping as Record<string, string>)[entretienCode];

          if (officialOperationName) {
              if (entretienCode === 'GR' && (!row['graisse'] || parseFloat(row['graisse'].toString().replace(',', '.')) <= 0)) {
                  continue; 
              }
              
              allOperations.push({
                  matricule: matricule,
                  operation: officialOperationName,
                  date: date,
                  releve: releve,
                  source: 'consolide'
              });

          } else {
              const combinedTextForMatching = `${entretienCode} ${obsText}`;
              if (!combinedTextForMatching.trim()) continue;

              const matchedEntretien = findMatchedEntretien(combinedTextForMatching);
              if (matchedEntretien) {
                  allOperations.push({
                      matricule: matricule,
                      operation: matchedEntretien,
                      date: date,
                      releve: releve,
                      source: 'consolide'
                  });
              }
          }
      }
      
      // 4. SAUVEGARDE
      if (allOperations.length) {
          await db.run('DELETE FROM history_cache');
          const stmt = await db.prepare(`INSERT INTO history_cache (matricule, operation, date, releve_compteur, source) VALUES (?, ?, ?, ?, ?)`);
          await db.run('BEGIN TRANSACTION');
          for (const o of allOperations) {
              await stmt.run(o.matricule, o.operation, o.date, o.releve, o.source);
          }
          await stmt.finalize();
          await db.run('COMMIT');
          console.log(`[generateHistoryMatrix] Sauvegardé ${allOperations.length} opérations dans history_cache.`);
      }
      
      return getHistoryMatrixFromCache(db);
  });
}
  
export async function getHistoryMatrixFromCache(dbInstance?: Database) {
    const process = async (db: Database) => {
        const allOperations = await db.all('SELECT * FROM history_cache');

        // --- Calculate Counts ---
        const counts: Record<string, number> = {};
        for (const op of allOperations) {
            if (op.operation) {
                counts[op.operation] = (counts[op.operation] || 0) + 1;
            }
        }
        const uniqueMatricules = new Set(allOperations.map(op => op.matricule));
        counts['MATRICULE'] = uniqueMatricules.size;
        const releveCount = allOperations.filter(op => op.releve_compteur != null).length;
        counts['relevé compteur'] = releveCount;


        const groupedByMatriculeAndMonth: { [key: string]: { [op: string]: string, releve?: number | null, dates: Set<string> } } = {};
        
        for (const op of allOperations) {
            const date = dayjs(op.date, 'DD/MM/YYYY');
            if (date.isValid() && op.operation && HEADER_ORDER.includes(op.operation as any)) {
                const key = `${op.matricule}|${date.format('YYYY-MM')}`;
                if (!groupedByMatriculeAndMonth[key]) {
                    groupedByMatriculeAndMonth[key] = { dates: new Set() };
                }
                groupedByMatriculeAndMonth[key][op.operation] = op.date;
                groupedByMatriculeAndMonth[key].dates.add(op.date);

                const releve = op.releve_compteur;
                if (releve) {
                    const existingReleve = groupedByMatriculeAndMonth[key].releve;
                    if (!existingReleve || releve > existingReleve) {
                        groupedByMatriculeAndMonth[key].releve = releve;
                    }
                }
            }
        }

        const sortedGroupKeys = Object.keys(groupedByMatriculeAndMonth).sort((a, b) => {
            const [matA, dateA] = a.split('|');
            const [matB, dateB] = b.split('|');
            if (matA < matB) return -1;
            if (matA > matB) return 1;
            if (dateA > dateB) return -1; // Sort by date descending for each matricule
            if (dateA < dateB) return 1;
            return 0;
        });

        const headers = HEADER_ORDER;
        const rows: (string | null)[][] = [];

        for (const key of sortedGroupKeys) {
            const [matricule] = key.split('|');
            const groupData = groupedByMatriculeAndMonth[key];
            const row: (string | null)[] = [matricule];

            for (let i = 1; i < headers.length; i++) {
                const header = headers[i];
                if (header === 'relevé compteur') {
                    row.push(groupData.releve?.toString() || null);
                } else {
                    row.push(groupData[header] || null);
                }
            }
            rows.push(row);
        }

        const result = { headers, rows, counts };
        console.log(`Historique chargé depuis le cache : ${result.rows.length} lignes de matrice créées.`);
        return result;
    };

    if (dbInstance) {
        return process(dbInstance);
    } else {
        return withDb(process);
    }
}


const createPlanningCacheTable = async (db: Awaited<ReturnType<typeof getDb>>): Promise<string> => {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS planning_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER,
        matricule TEXT,
        categorie TEXT,
        entretien TEXT,
        date_programmee TEXT,
        intervalle INTEGER,
        niveau TEXT
      )
    `);
    await db.exec('CREATE INDEX IF NOT EXISTS idx_planning_year ON planning_cache(year)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_planning_mat ON planning_cache(matricule)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_planning_date ON planning_cache(date_programmee)');
    return 'Table planning_cache created or verified successfully.';
  } catch (error: any) {
    throw new Error(`Failed to create planning_cache table: ${error.message}`);
  }
};

export async function getHistoryForEquipment(matricule: string): Promise<any[]> {
    try {
        return await withDb(async (db) => {
            const operations = await db.all('SELECT * FROM history_cache WHERE matricule = ?', [matricule]);
            return operations.map((op, index) => ({
                id: op.id || index,
                matricule: op.matricule,
                operation: op.operation,
                date_programmee: op.date, 
                date_realisation: op.date,
                nature: 'Réalisé', 
                niveau: 'Historique',
                intervalle_jours: null,
            }));
        });
    } catch(e) {
        console.error(`Error getting history for equipment ${matricule}`, e);
        return [];
    }
}

const savePlanningToDb = async (db: Database, year: number, data: any[]) => {
    if (!data || data.length === 0) {
      console.log(`[SAVE] Aucune donnée à sauvegarder pour l'année ${year}.`);
      return;
    }
    
    await db.run(`DELETE FROM planning_cache WHERE year = ?`, [year]);
    const stmt = await db.prepare(`
        INSERT INTO planning_cache
            (year, matricule, categorie, entretien, date_programmee, intervalle, niveau)
            VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    await db.run('BEGIN TRANSACTION');
    for (const r of data) {
        await stmt.run(
            year,
            r.matricule,
            r.categorie,
            r.entretien,
            r.date_programmee,
            r.intervalle,
            r.niveau
        );
    }
    await stmt.finalize();
    await db.run('COMMIT');
    console.log(`[SAVE] ${data.length} entrées sauvegardées pour l'année ${year}.`);
};

export const generatePlanning = async (year: number) => {
    return withDb(async (db) => {
        const [matrice, paramsRaw, fullHistory] = await Promise.all([
            db.all('SELECT matricule, categorie FROM matrice'),
            db.all('SELECT * FROM param'),
            db.all('SELECT matricule, operation, MAX(date) as last_date FROM history_cache GROUP BY matricule, operation')
        ]);

        const allowedEntretiensByCategory: Record<string, Set<string>> = {};
        const hasCategoryRules = (await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='category_entretiens'")) !== undefined;

        if (hasCategoryRules) {
            try {
                const allowedRows = await db.all('SELECT category, entretien FROM category_entretiens WHERE is_active = 1');
                for (const row of allowedRows) {
                    const categoryNorm = normalize(row.category).replace(/,/g, '');
                    if (!allowedEntretiensByCategory[categoryNorm]) {
                        allowedEntretiensByCategory[categoryNorm] = new Set();
                    }
                    allowedEntretiensByCategory[categoryNorm].add(normalize(row.entretien));
                }
            } catch (e) {
                console.warn("Could not read from category_entretiens table. No category-based exclusions will be applied.", e);
            }
        }

        const lastDatesByMatricule: { [matricule: string]: { [opNorm: string]: dayjs.Dayjs } } = {};
        for (const h of fullHistory) {
            if (!h.matricule || !h.operation) continue;
            const matriculeNorm = normalize(h.matricule);
            if (!lastDatesByMatricule[matriculeNorm]) {
                lastDatesByMatricule[matriculeNorm] = {};
            }
            const date = dayjs(h.last_date, 'DD/MM/YYYY');
            if (date.isValid()) {
                const opNorm = normalize(h.operation);
                lastDatesByMatricule[matriculeNorm][opNorm] = date;
            }
        }
        
        const paramHeaders = Object.keys(paramsRaw[0] || {});
        const intervalCols = ['7', '30', '90', '180', '360'];
        
        const levelColNames: string[] = [];
        const levelCols: { name: string, level: 'C'|'N'|'CH' }[] = [
            { name: paramHeaders.find(h => h.toLowerCase().includes('contrôler')) || '', level: 'C' },
            { name: paramHeaders.find(h => h.toLowerCase().includes('nettoyage')) || '', level: 'N' },
            { name: paramHeaders.find(h => h.toLowerCase().includes('changement')) || '', level: 'CH' },
        ].filter(c => c.name).map(c => {
            levelColNames.push(c.name);
            return c;
        });

        const knownCols = new Set(['id', ...intervalCols, ...levelColNames]);
        const opCol = paramHeaders.find(h => !knownCols.has(h));

        if (!opCol) {
            console.error('CRITICAL: Could not determine the operation column in the "Param" table. Planning generation failed.');
            return { count: 0, rows: [] };
        }

        const levelPriority = { 'C': 1, 'N': 2, 'CH': 3 };

        let potentialResults: any[] = [];
        const startOfYear = dayjs(`${year}-01-01`);
        const endOfYear = dayjs(`${year}-12-31`);

        for (const engin of matrice) {
            const matricule = (engin.matricule || '').trim();
            if (!matricule) continue;
            
            const categorieNorm = normalize(engin.categorie || '').replace(/,/g, '');
            const allowedForCategory = allowedEntretiensByCategory[categorieNorm];

            for (const param of paramsRaw) {
                const entretienNameFromParam = (param[opCol] || '').trim();
                if (!entretienNameFromParam) continue;

                const officialEntretienName = OFFICIAL_ENTRETIENS.find(e => normalize(e) === normalize(entretienNameFromParam));
                if (!officialEntretienName) continue;
                
                const entretienNorm = normalize(officialEntretienName);
                if (hasCategoryRules && allowedForCategory !== undefined && !allowedForCategory.has(entretienNorm)) {
                    continue;
                }
                
                const lastDate = lastDatesByMatricule[normalize(matricule)]?.[entretienNorm];
                
                const activeIntervals = intervalCols
                    .map(intervalStr => ({
                        interval: parseInt(intervalStr),
                        symbol: param[intervalStr]?.toString().trim()
                    }))
                    .filter(item => item.symbol === '*' || item.symbol === '**');
                
                const activeLevels = levelCols
                    .filter(l => param[l.name])
                    .map(l => l.level)
                    .sort((a, b) => (levelPriority[a] || 0) - (levelPriority[b] || 0));

                activeIntervals.forEach((intervalItem, index) => {
                    const level = activeLevels[index];
                    if (!level) return;
                    
                    const { interval } = intervalItem;

                    const referenceDate = lastDate || dayjs(`${year}-01-01`);
                    let currentDate = referenceDate.clone();
                    
                    while (currentDate.isBefore(startOfYear)) {
                        currentDate = currentDate.add(interval, 'day');
                    }
                    
                    while (currentDate.isSameOrBefore(endOfYear)) {
                        potentialResults.push({
                            matricule: matricule,
                            categorie: engin.categorie,
                            entretien: officialEntretienName,
                            date_programmee: currentDate.format('DD/MM/YYYY'),
                            intervalle: interval,
                            niveau: level,
                            priority: levelPriority[level]
                        });
                        currentDate = currentDate.add(interval, 'day');
                    }
                });
            }
        }
        
        const finalResultsMap: Map<string, any> = new Map();
        
        potentialResults.sort((a,b) => b.priority - a.priority);

        for (const res of potentialResults) {
            const key = `${res.matricule}|${res.entretien}|${res.date_programmee}`;
            if (!finalResultsMap.has(key)) {
                finalResultsMap.set(key, res);
            }
        }
        
        const finalResults = Array.from(finalResultsMap.values());
        
        await savePlanningToDb(db, year, finalResults);
        console.log(`✅ Planning complet généré pour ${year} : ${finalResults.length} entrées.`);
        
        return { count: finalResults.length, rows: finalResults };
    });
};

const createPlanningMatrix = async (db: Database, year: number, filter = '', page = 1, pageSize = 1, forExport = false, applyFollowUp = false) => {
    const allMatriculesQuery = `SELECT DISTINCT matricule FROM matrice WHERE matricule IS NOT NULL AND matricule != '' ORDER BY matricule`;
    const allMatricules = (await db.all(allMatriculesQuery)).map(m => m.matricule);
    
    let filteredMatricules = allMatricules;
    if (filter) {
        filteredMatricules = allMatricules.filter(m => m.toLowerCase().includes(filter.toLowerCase()));
    }
    
    const total = filteredMatricules.length;
    const paginatedMatricules = forExport ? filteredMatricules : filteredMatricules.slice((page - 1) * pageSize, page * pageSize);

    if (paginatedMatricules.length === 0) {
        return { headers: ['MATRICULE', 'MOIS', ...OFFICIAL_ENTRETIENS], rows: [], total: 0 };
    }

    const matriculePlaceholders = paginatedMatricules.map(() => '?').join(',');
    const interventionsQuery = `
        SELECT id, matricule, entretien, date_programmee, niveau 
        FROM planning_cache 
        WHERE year = ? AND matricule IN (${matriculePlaceholders})
    `;
    const interventionsParams = [year, ...paginatedMatricules];
    let processedInterventions = (await db.all(interventionsQuery, interventionsParams)).map(inv => ({
        ...inv,
        date: dayjs(inv.date_programmee, 'DD/MM/YYYY'),
        realise: false,
        date_realisation: undefined as (string | undefined),
        status: 'planifié'
    }));

    if (applyFollowUp) {
        const historyData = await db.all('SELECT id, matricule, operation, date FROM history_cache');
        const realizedInterventions = historyData
            .map(h => ({
                ...h,
                date: dayjs(h.date, 'DD/MM/YYYY'),
                usedInMatch: false,
            }))
            .filter(h => h.date.isValid() && h.date.year() === year);

        let plannedInterventionsWithMatchInfo = processedInterventions.map(p => ({ ...p, usedInMatch: false }));

        for (const realized of realizedInterventions) {
            let bestMatch: { planned: (typeof plannedInterventionsWithMatchInfo)[number], diff: number } | null = null;
            
            for (const planned of plannedInterventionsWithMatchInfo) {
                if (!planned.usedInMatch &&
                    normalize(realized.matricule) === normalize(planned.matricule) &&
                    normalize(realized.operation) === normalize(planned.entretien)) {
                    
                    const diff = Math.abs(realized.date.diff(planned.date, 'day'));
                    if (diff <= 30) {
                        if (!bestMatch || diff < bestMatch.diff) {
                            bestMatch = { planned, diff };
                        }
                    }
                }
            }

            if (bestMatch) {
                bestMatch.planned.realise = true;
                bestMatch.planned.date_realisation = realized.date.format('DD/MM/YYYY');
                bestMatch.planned.status = 'réalisé';
                bestMatch.planned.usedInMatch = true;
                realized.usedInMatch = true;
            }
        }
        
        const horsPlanning = realizedInterventions
            .filter(r => !r.usedInMatch)
            .map(r => ({
                id: `hp-${r.id}`,
                matricule: r.matricule,
                entretien: r.operation,
                date_programmee: r.date.format('DD/MM/YYYY'),
                niveau: 'HP', 
                date: r.date,
                realise: true,
                usedInMatch: true,
                date_realisation: r.date.format('DD/MM/YYYY'),
                status: 'hors-planning'
            }));
        
        processedInterventions = [...plannedInterventionsWithMatchInfo, ...horsPlanning];
    }
    
    const levelPriority: Record<string, number> = { 'C': 1, 'N': 2, 'CH': 3, 'HP': 4 };
    
    const interventionsByMatricule: { [key: string]: any[] } = {};
    for (const inv of processedInterventions) {
        if (!interventionsByMatricule[inv.matricule]) {
            interventionsByMatricule[inv.matricule] = [];
        }
        interventionsByMatricule[inv.matricule].push({
            ...inv,
            month: inv.date.month()
        });
    }

    const matrixRows: any[] = [];
    
    for (const equipmentMatricule of paginatedMatricules) {
        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            const rowData: any[] = [equipmentMatricule, dayjs().month(monthIndex).format('MMMM')];
            const cells = Array.from({ length: OFFICIAL_ENTRETIENS.length }, () => null);

            const interventionsForMonth = (interventionsByMatricule[equipmentMatricule] || [])
                .filter(inv => inv.month === monthIndex);
            
            const byEntretien: Record<string, any[]> = {};
            for (const intervention of interventionsForMonth) {
                const entretienName = intervention.entretien;
                const officialMatch = OFFICIAL_ENTRETIENS.find(official => 
                    normalize(official) === normalize(entretienName)
                );
                
                if (officialMatch) {
                    if (!byEntretien[officialMatch]) {
                        byEntretien[officialMatch] = [];
                    }
                    byEntretien[officialMatch].push(intervention);
                }
            }
            
            for (const [entretienOfficial, interventions] of Object.entries(byEntretien)) {
                const colIndex = OFFICIAL_ENTRETIENS.indexOf(entretienOfficial as any);
                if (colIndex === -1) continue;
                
                const bestIntervention = interventions.reduce((best, current) => {
                    const bestPriority = levelPriority[best.niveau] || 0;
                    const currentPriority = levelPriority[current.niveau] || 0;
                    if (current.realise && !best.realise) return current;
                    if (!current.realise && best.realise) return best;
                    if (currentPriority > bestPriority) return current;
                    if (currentPriority === bestPriority && current.date.isAfter(best.date)) return current;
                    return best;
                });
                
                cells[colIndex] = [{
                    date_programmee: bestIntervention.date_programmee,
                    niveau: bestIntervention.niveau,
                    realise: bestIntervention.realise,
                    date_realisation: bestIntervention.date_realisation,
                }];
            }
            
            matrixRows.push([...rowData, ...cells]);
        }
    }

    const headers = ['MATRICULE', 'MOIS', ...OFFICIAL_ENTRETIENS];
    return { headers, rows: matrixRows, total };
};

export const getPlanningPage = async (
    year: number,
    page = 1,
    pageSize = 1,
    filter = ''
): Promise<{ headers: readonly string[]; rows: any[]; total: number }> => {
    return withDb(async (db) => {
        return createPlanningMatrix(db, year, filter, page, pageSize, false, false);
    });
};

export const getFollowUpPage = async (
    year: number,
    page = 1,
    pageSize = 1,
    filter = ''
): Promise<{ headers: readonly string[]; rows: any[]; total: number }> => {
    return withDb(async (db) => {
        return createPlanningMatrix(db, year, filter, page, pageSize, false, true);
    });
};

export const getPlanningMatrixForExport = async (
    year: number
  ): Promise<{ headers: readonly string[]; rows: any[] }> => {
    return withDb(async (db) => {
        try {
            const { total } = await createPlanningMatrix(db, year, '', 1, 1, false, false);
            return createPlanningMatrix(db, year, '', 1, total > 0 ? total : 1, true, false);
        } catch(e) {
            return { headers: [], rows: [] };
        }
    });
};

export const getFollowUpMatrixForExport = async (
    year: number
  ): Promise<{ headers: readonly string[]; rows: any[] }> => {
    return withDb(async (db) => {
        try {
            const { total } = await createPlanningMatrix(db, year, '', 1, 1, false, true);
            return createPlanningMatrix(db, year, '', 1, total > 0 ? total : 1, true, true);
        } catch(e) {
            return { headers: [], rows: [] };
        }
    });
  };

export const getAllPlanning = async () => {
    return withDb(async (db) => {
        return await db.all(`SELECT * FROM planning_cache ORDER BY year, substr(date_programmee, 7, 4), substr(date_programmee, 4, 2), substr(date_programmee, 1, 2)`);
    });
};

export const getPreventativeHistoryForEquipment = async (matricule: string) => {
  return withDb(async (db) => {
    const preventativeEntries: PreventativeMaintenanceEntry[] = [];
    const consolideData = await db.all('SELECT * FROM consolide WHERE matricule = ?', [matricule]);
    const oilColumns = ['t32', '20w50', '10w', '15w40', '90', '15w40_v', 'hvol', 'tvol', 't30', 'graisse', 't46', '15w40_quartz'];

    for (const row of consolideData) {
        const entretienCode = row['entretien']?.toString().trim().toUpperCase();
        if (!entretienCode) continue;

        const officialOperationName = (planningOperationNameMapping as Record<string, string>)[entretienCode];
        if (!officialOperationName) continue;

        const date = parseDateSafe(row['date']);
        if (!date) continue;
        
        if (entretienCode === 'GR' && (!row['graisse'] || parseFloat(row['graisse'].toString().replace(',', '.')) <= 0)) {
            continue;
        }

        const details: string[] = [];
        const counter = extraireReleve(row['obs']);
        if (counter) {
            details.push(`Relevé compteur: ${counter.toLocaleString('fr-FR')}`);
        }

        for (const col of oilColumns) {
            if (row[col]) {
                const oilQty = parseFloat(row[col].toString().replace(',', '.') || '0');
                if (oilQty > 0) {
                    details.push(`Huile ${col.replace(/_/g, ' ').toUpperCase()}: ${oilQty}L`);
                }
            }
        }
        
        preventativeEntries.push({
            id: `consolide-${row.id}`,
            operation: officialOperationName,
            date: date,
            details: details,
        });
    }

    const vidangeData = await db.all('SELECT * FROM vidange WHERE matricule = ?', [matricule]);
    for (const row of vidangeData) {
      const dateStr = getVal(row, 'date', 'date_entretien');
      const date = parseDateSafe(dateStr);
      if (!date) continue;

      const counterStr = getVal(row, 'compteur_kmh', 'compteur_km_h');
      const counter = extraireReleve(counterStr);
      const details = counter ? [`Relevé compteur: ${counter.toLocaleString('fr-FR')}`] : [];
      preventativeEntries.push({ id: `vidange-main-${row.id}`, operation: 'Vidanger le carter moteur', date, details });
      
      const flag = (v: any) => typeof v === 'string' && ['*', '**'].includes(v.trim());
      const obs = (row.obs || '').toUpperCase();
      const rowKeys = Object.keys(row);

      const fhKey = rowKeys.find(k => k === 'fh' || k === 'f_h');
      const fgKey = rowKeys.find(k => k === 'fg' || k === 'f_g');
      const fairKey = rowKeys.find(k => k === 'fair' || k === 'f_air');
      const fhydKey = rowKeys.find(k => k === 'fhyd' || k === 'f_hyd');

      if ((fhKey && flag(row[fhKey])) || obs.includes('FH')) preventativeEntries.push({ id: `vidange-fh-${row.id}`, operation: 'Filtre à huile', date, details });
      if ((fgKey && flag(row[fgKey])) || obs.includes('FG')) preventativeEntries.push({ id: `vidange-fg-${row.id}`, operation: 'Filtre carburant', date, details });
      if ((fairKey && flag(row[fairKey])) || obs.includes('FAIR')) preventativeEntries.push({ id: `vidange-fa-${row.id}`, operation: 'Filtre à air', date, details });
      if ((fhydKey && flag(row[fhydKey])) || obs.includes('FHYD')) preventativeEntries.push({ id: `vidange-fhyd-${row.id}`, operation: 'Filtre hydraulique', date, details });
      if (obs.includes('CHAINE')) preventativeEntries.push({ id: `vidange-chaine-${row.id}`, operation: 'chaine', date, details });
    }

    const grouped: Record<string, PreventativeMaintenanceEntry[]> = {};
    for (const entry of preventativeEntries) {
      if (!grouped[entry.operation]) {
        grouped[entry.operation] = [];
      }
      grouped[entry.operation].push(entry);
    }

    for (const op in grouped) {
      grouped[op].sort((a, b) => dayjs(b.date, 'DD/MM/YYYY').valueOf() - dayjs(a.date, 'DD/MM/YYYY').valueOf());
    }

    return grouped;
  });
}; 

export const getCurativeHistoryForEquipment = async (matricule: string): Promise<CurativeMaintenanceEntry[]> => {
    return withDb(async (db) => {
        const rows = await db.all('SELECT * FROM suivi_curatif WHERE matricule = ? ORDER BY id DESC', [matricule]);

        const parsePieces = (text: string | null): string[] => {
            if (!text) return [];
            
            if (text.includes('-')) {
                 let items = text.toLowerCase();
                if (items.startsWith('remplacement de ') || items.startsWith('changement de ')) {
                    items = items.substring(items.indexOf(' de ') + 4);
                }
                return items.split('-').map(item => item.trim()).filter(Boolean);
            }

            return [text];
        };

        return rows.map((row): CurativeMaintenanceEntry => {
            const dateEntree = dayjs(row.date_entree, 'DD/MM/YYYY');
            let dateSortie;
            let joursIndisponibilite = parseInt(row.nbr_indisponibilite, 10);

            if (row.date_sortie && row.date_sortie.toLowerCase().includes('cour')) {
                dateSortie = dayjs(); 
                if (dateEntree.isValid()) {
                   joursIndisponibilite = dateSortie.diff(dateEntree, 'day');
                }
            } else {
                dateSortie = dayjs(row.date_sortie, 'DD/MM/YYYY');
            }
            
            if (isNaN(joursIndisponibilite)) {
                if (dateEntree.isValid() && dateSortie.isValid()) {
                    joursIndisponibilite = dateSortie.diff(dateEntree, 'day');
                } else {
                    joursIndisponibilite = 0;
                }
            }

            const officialTags = OFFICIAL_ENTRETIENS.filter(entretien => 
                row.pieces?.toLowerCase().includes(entretien.toLowerCase())
            );

            return {
                id: row.id,
                panneDeclaree: row.panne_declaree,
                typePanne: row.type_de_panne || 'non spécifié',
                dateEntree: dateEntree.isValid() ? dateEntree.format('DD/MM/YYYY') : row.date_entree,
                dateSortie: dateSortie.isValid() ? dateSortie.format('DD/MM/YYYY') : row.date_sortie,
                dureeIntervention: joursIndisponibilite,
                piecesRemplacees: parsePieces(row.pieces),
                details: {
                    Intervenant: row.intervenant,
                    Affectation: row.affectation,
                    'Statut Actuel': row.sitactuelle,
                    'Jours Ouvrables': row.jour_ouvrable,
                },
                tags: officialTags,
            };
        });
    });
};

export async function getEquipmentDetails(matricule: string) {
    try {
        return await withDb(async (db) => {
            return await db.get('SELECT * FROM matrice WHERE matricule = ?', [matricule]);
        });
    } catch(e: any) {
        if (e.code === 'SQLITE_ERROR' && e.message.includes('no such table')) {
            console.warn(`Table 'matrice' not found for getEquipmentDetails. DB not initialized?`);
        } else {
            console.error(`Could not get details for equipment ${matricule}`, e);
        }
        return null;
    }
}

export async function getEquipmentDynamicStatus(matricule: string): Promise<'En Marche' | 'En Panne' | 'Actif'> {
    try {
        return await withDb(async (db) => {
            try {
                const lastIntervention = await db.get(
                    `SELECT date_sortie FROM suivi_curatif WHERE matricule = ? 
                     ORDER BY 
                       substr(date_entree, 7, 4) DESC, 
                       substr(date_entree, 4, 2) DESC, 
                       substr(date_entree, 1, 2) DESC, 
                       id DESC 
                     LIMIT 1`,
                    [matricule]
                );

                if (!lastIntervention) {
                    return 'Actif';
                }
                
                if (lastIntervention.date_sortie && lastIntervention.date_sortie.toLowerCase().includes('cour')) {
                    return 'En Panne';
                }

                return 'En Marche';

            } catch (e: any) {
                 if (e.code === 'SQLITE_ERROR' && e.message.includes('no such table')) {
                    return 'Actif';
                }
                console.error(`Could not determine dynamic status for ${matricule}`, e);
                return 'Actif';
            }
        });
    } catch (e) {
        console.error(`Could not connect to database for getEquipmentDynamicStatus`, e);
        return 'Actif';
    }
}

export async function getSuiviCuratifRaw() {
    return withDb(async (db) => {
        try {
            // We select all columns to provide a raw view, limited to the last 50 entries for performance.
            return await db.all('SELECT * FROM suivi_curatif ORDER BY id DESC LIMIT 50');
        } catch (e: any) {
            if (e.code === 'SQLITE_ERROR' && e.message.includes('no such table')) {
                console.warn("Table 'suivi_curatif' not found. The database might not be initialized.");
                return [];
            }
            throw e;
        }
    });
}

export async function getAllPlanningForYear(year: number) {
    return withDb(async (db) => {
        try {
            return await db.all(`
                SELECT 
                    pc.matricule, 
                    m.designation,
                    pc.entretien as operation, 
                    pc.date_programmee,
                    pc.niveau
                FROM planning_cache pc
                LEFT JOIN matrice m ON pc.matricule = m.matricule
                WHERE pc.year = ?
            `, [year]);
        } catch (e: any) {
            if (e.code === 'SQLITE_ERROR' && e.message.includes('no such table')) {
                console.warn("Table 'planning_cache' or 'matrice' not found. The database might not be initialized.");
                return [];
            }
            throw e;
        }
    });
}

export async function getParams() {
  return withDb(async (db) => {
    try {
      return await db.all('SELECT * FROM param ORDER BY id');
    } catch (e: any) {
      if (e.code === 'SQLITE_ERROR' && e.message.includes('no such table')) {
        console.warn("Table 'Param' not found. The database might not be initialized.");
        return [];
      }
      throw e;
    }
  });
}

export async function updateParam(id: number, column: string, value: string | null) {
  return withDb(async (db) => {
    const info = await db.all(`PRAGMA table_info(Param)`);
    const allowedColumns = info.map(col => col.name);

    if (!allowedColumns.includes(column)) {
      throw new Error(`Invalid column name provided: ${column}`);
    }

    const result = await db.run(
      `UPDATE Param SET "${column}" = ? WHERE id = ?`,
      [value, id]
    );

    if (result.changes === 0) {
      console.warn(`No rows updated for param id ${id}.`);
    }

    try {
        await db.run('DELETE FROM planning_cache');
        console.log('Planning cache cleared due to parameter update.');
    } catch (e) {
        console.log('Could not clear planning cache (it may not exist yet).');
    }

    return { success: true };
  });
}

async function getProcessedHistory(db: Database): Promise<{ matricule: string, operation: string, date: dayjs.Dayjs, releve: number | null }[]> {
    const historyData = await db.all('SELECT matricule, operation, date, releve_compteur FROM history_cache');
    
    return historyData.map(record => ({
        matricule: record.matricule,
        operation: record.operation,
        date: dayjs(record.date, 'DD/MM/YYYY'),
        releve: record.releve_compteur,
    })).filter(record => record.date.isValid() && record.operation);
}


export async function getFollowUpStatistics(year: number) {
    return withDb(async (db) => {
        const allInterventions = await db.all('SELECT * FROM planning_cache WHERE year = ?', [year]);

        if (allInterventions.length === 0) {
            return {
                totalPlanifie: 0,
                totalRealise: 0,
                planifieByNiveau: { C: 0, N: 0, CH: 0 },
                realiseByNiveau: { C: 0, N: 0, CH: 0 },
                realiseByEntretien: {},
                planifieByEntretien: {},
            };
        }

        const processedHistory = await getProcessedHistory(db);
        const historyByMatriculeAndOp: { [key: string]: dayjs.Dayjs[] } = {};

        for (const record of processedHistory) {
            const key = `${normalize(record.matricule)}|${normalize(record.operation)}`;
            if (!historyByMatriculeAndOp[key]) {
                historyByMatriculeAndOp[key] = [];
            }
            historyByMatriculeAndOp[key].push(record.date);
        }

        const stats = {
            totalPlanifie: allInterventions.length,
            totalRealise: 0,
            planifieByNiveau: { C: 0, N: 0, CH: 0 } as Record<string, number>,
            realiseByNiveau: { C: 0, N: 0, CH: 0 } as Record<string, number>,
            realiseByEntretien: {} as Record<string, number>,
            planifieByEntretien: {} as Record<string, number>,
        };

        for (const intervention of allInterventions) {
             stats.planifieByEntretien[intervention.entretien] = (stats.planifieByEntretien[intervention.entretien] || 0) + 1;
            if (stats.planifieByNiveau[intervention.niveau] !== undefined) {
                stats.planifieByNiveau[intervention.niveau]++;
            }
            
            const interventionDate = dayjs(intervention.date_programmee, 'DD/MM/YYYY');
            const historyKey = `${normalize(intervention.matricule)}|${normalize(intervention.entretien)}`;
            const historyDates = (historyByMatriculeAndOp[historyKey] || []);
            
            let isRealise = false;

            for (const historyDate of historyDates) {
                if (Math.abs(historyDate.diff(interventionDate, 'day')) <= 30) {
                    isRealise = true;
                    break;
                }
            }
            
            if (isRealise) {
                stats.totalRealise++;
                if (stats.realiseByNiveau[intervention.niveau] !== undefined) {
                    stats.realiseByNiveau[intervention.niveau]++;
                }
                stats.realiseByEntretien[intervention.entretien] = (stats.realiseByEntretien[intervention.entretien] || 0) + 1;
            }
        }

        return stats;
    });
}

export async function getDistinctCategories() {
    return withDb(async (db) => {
        try {
            const rows = await db.all('SELECT DISTINCT categorie FROM matrice');
            return rows.map(r => r.categorie).filter(Boolean).sort();
        } catch (e: any) {
            if (e.code === 'SQLITE_ERROR' && e.message.includes('no such table')) {
                console.warn("Table 'matrice' not found.");
            } else {
                console.error("An error occurred in getDistinctCategories:", e.message);
            }
            return [];
        }
    });
}

export async function getCategoryEntretiens() {
    return withDb(async (db) => {
        try {
            const rows = await db.all('SELECT category, entretien, is_active FROM category_entretiens');
            const data: Record<string, Record<string, boolean>> = {};
            for (const row of rows) {
                if (!data[row.category]) {
                    data[row.category] = {};
                }
                data[row.category][row.entretien] = !!row.is_active;
            }
            return data;
        } catch (e: any) {
             if (e.code === 'SQLITE_ERROR' && e.message.includes('no such table')) {
                console.warn("Table 'category_entretiens' not found.");
            } else {
                console.error("An error occurred in getCategoryEntretiens:", e.message);
            }
            return {};
        }
    });
}

export async function updateCategoryEntretiens(category: string, entretien: string, isActive: boolean) {
    return withDb(async (db) => {
        const result = await db.run(
            'UPDATE category_entretiens SET is_active = ? WHERE category = ? AND entretien = ?',
            [isActive ? 1 : 0, category, entretien]
        );
         if (result.changes === 0) {
          // If no rows were updated, it might be a new category. Try inserting.
          await db.run(
            'INSERT OR IGNORE INTO category_entretiens (category, entretien, is_active) VALUES (?, ?, ?)',
            [category, entretien, isActive ? 1 : 0]
          )
        }

        try {
            await db.run('DELETE FROM planning_cache');
            console.log('Planning cache cleared due to category parameter update.');
        } catch (e) {
            console.log('Could not clear planning cache (it may not exist yet).');
        }
        return { success: true };
    });
}

export async function addCurativeOperationToDb(operationData: any) {
  return withDb(async (db) => {
    const equipment = await db.get('SELECT categorie, designation FROM matrice WHERE matricule = ?', [operationData.matricule]);

    if (!equipment) {
        throw new Error(`Matricule '${operationData.matricule}' non trouvé dans la table des équipements.`);
    }

    const fullOperationData = {
        ...operationData,
        categorie: equipment.categorie,
        designation: equipment.designation
    };

    const columns = [
        'categorie', 'designation', 'matricule', 'date_entree', 
        'panne_declaree', 'sitactuelle', 'pieces', 'date_sortie', 
        'intervenant', 'affectation', 'type_de_panne', 
        'nbr_indisponibilite', 'jour_ouvrable', 'ratio', 
        'jour_disponibilite', 'ratio2'
    ];

    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO suivi_curatif (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

    const values = columns.map(col => fullOperationData[col] ?? null);

    const result = await db.run(sql, values);

    // Also add to history cache for immediate availability in other views
    if (result.lastID && fullOperationData.pieces) {
        const piecesList = fullOperationData.pieces.toLowerCase().split('-').map((p: string) => p.trim()).filter(Boolean);
        const releve = extraireReleve(fullOperationData.panne_declaree);
        const insertHistoryStmt = await db.prepare(`INSERT INTO history_cache (matricule, operation, date, releve_compteur, source) VALUES (?, ?, ?, ?, ?)`);

        for (const piece of piecesList) {
            const matchedEntretien = findMatchedEntretien(piece);
           if (matchedEntretien) {
                await insertHistoryStmt.run(
                    fullOperationData.matricule, 
                    matchedEntretien, 
                    fullOperationData.date_entree, 
                    releve, 
                    'suivi_curatif_new'
                );
           }
        }
        await insertHistoryStmt.finalize();
    }


    return { id: result.lastID };
  });
}

export async function generateAndSaveWeeklyReport(targetDate?: Date) {
    return withDb(async (db) => {
        // --- Calculate Dates ---
        const referenceDate = dayjs(targetDate || new Date());
        // day() is 0 for Sunday. VBA Weekday(date, 1) is 1 for Sunday.
        const vbaWeekday = referenceDate.day() + 1;
        const dateDim = referenceDate.subtract(vbaWeekday - 1, 'day');
        const dateJeu = dateDim.add(4, 'day');

        // --- Fetch Data ---
        const allPannes = await db.all(`
            SELECT 
                m.designation, 
                sc.matricule, 
                sc.date_entree, 
                sc.panne_declaree, 
                sc.pieces, 
                sc.date_sortie, 
                sc.intervenant 
            FROM suivi_curatif sc
            LEFT JOIN matrice m ON sc.matricule = m.matricule
        `);
        
        const allReportPannes: WeeklyReportItem[] = [];

        const isDateInWeek = (date: dayjs.Dayjs) => date.isSameOrAfter(dateDim, 'day') && date.isSameOrBefore(dateJeu, 'day');

        for (const panne of allPannes) {
            const entreeStr = panne.date_entree;
            if (!entreeStr || !dayjs(entreeStr, "DD/MM/YYYY").isValid()) {
                continue;
            }

            const dEnt = dayjs(entreeStr, "DD/MM/YYYY");
            const sortieStr = panne.date_sortie;
            const dSort = (sortieStr && sortieStr !== "En Cours" && dayjs(sortieStr, "DD/MM/YYYY").isValid())
                ? dayjs(sortieStr, "DD/MM/YYYY")
                : null;

            // User's 3 rules for inclusion
            const case1 = isDateInWeek(dEnt) && !dSort; // Starts in week, is ongoing
            const case2 = dSort ? (isDateInWeek(dEnt) && isDateInWeek(dSort)) : false; // Starts and ends in week
            const case3 = dSort ? (dEnt.isBefore(dateDim) && isDateInWeek(dSort)) : false; // Starts before, ends in week

            const shouldInclude = case1 || case2 || case3;

            if (shouldInclude) {
                allReportPannes.push({
                    numero: 0, // Placeholder
                    designation: panne.designation,
                    matricule: panne.matricule,
                    date_panne: dEnt.format("DD/MM/YYYY"),
                    nature_panne: panne.panne_declaree,
                    reparations: (panne.pieces || '').split('-').map((p:string) => p.trim()).filter(Boolean),
                    date_sortie: dSort ? dSort.format("DD/MM/YYYY") : "En Cours",
                    intervenant: panne.intervenant,
                    obs: ''
                });
            }
        }
        
        allReportPannes.sort((a, b) => dayjs(a.date_panne, "DD/MM/YYYY").unix() - dayjs(b.date_panne, "DD/MM/YYYY").unix());
        
        allReportPannes.forEach((p, index) => {
            p.numero = index + 1;
        });

        const reportData: Omit<WeeklyReport, 'id'> = {
            start_date: dateDim.format('YYYY-MM-DD'),
            end_date: dateJeu.format('YYYY-MM-DD'),
            generated_at: dayjs().format(),
            pannes: allReportPannes
        };

        const result = await db.run(
            `INSERT INTO weekly_reports (start_date, end_date, generated_at, report_data_json) VALUES (?, ?, ?, ?)`,
            [reportData.start_date, reportData.end_date, reportData.generated_at, JSON.stringify(reportData.pannes)]
        );

        return result.lastID;
    });
}

export async function getWeeklyReports() {
    return withDb(async (db) => {
        try {
            return await db.all('SELECT id, start_date, end_date, generated_at FROM weekly_reports ORDER BY generated_at DESC');
        } catch (e) {
            console.error("Failed to get weekly reports list", e);
            return [];
        }
    });
}

export async function getWeeklyReport(id: number): Promise<WeeklyReport | null> {
     return withDb(async (db) => {
        try {
            const row = await db.get('SELECT * FROM weekly_reports WHERE id = ?', id);
            if (!row) return null;

            return {
                id: row.id,
                start_date: row.start_date,
                end_date: row.end_date,
                generated_at: row.generated_at,
                pannes: JSON.parse(row.report_data_json),
            };

        } catch (e) {
            console.error(`Failed to get weekly report with id ${id}`, e);
            return null;
        }
    });
}

export async function deleteWeeklyReport(id: number) {
    return withDb(async (db) => {
        const result = await db.run('DELETE FROM weekly_reports WHERE id = ?', id);
        if (result.changes === 0) {
            console.warn(`Attempted to delete report with id ${id}, but it was not found.`);
        }
        return { success: true };
    });
}

export async function getMonthlyCurativeCounts(year?: number): Promise<MonthlyCount[]> {
  const targetYear = (year || new Date().getFullYear()).toString();
  return withDb(async (db) => {
    try {
      const rows = await db.all(`
        SELECT
          substr(date_entree, 4, 2) as month,
          COUNT(*) as count
        FROM suivi_curatif
        WHERE substr(date_entree, 7, 4) = ?
        GROUP BY month
        ORDER BY month
      `, [targetYear]);

      const monthMap = new Map(rows.map(r => [r.month, r.count]));

      const result = Array.from({ length: 12 }, (_, i) => {
        const monthNum = (i + 1).toString().padStart(2, '0');
        return {
          month: dayjs().month(i).format('MMM'),
          count: monthMap.get(monthNum) || 0,
        };
      });

      return result;

    } catch (e: any) {
      console.error("Failed to get monthly curative counts:", e.message);
      // Return a default structure on error
      return Array.from({ length: 12 }, (_, i) => ({ month: dayjs().month(i).format('MMM'), count: 0 }));
    }
  });
}

export async function getMonthlyPreventativeStats(year: number): Promise<MonthlyPreventativeStats> {
    const targetYear = year.toString();
    const defaultData = {
        monthlyData: Array.from({ length: 12 }, (_, i) => ({
            month: dayjs().month(i).format('MMM'),
            vidange: 0,
            graissage: 0,
            transmission: 0,
            hydraulique: 0,
            autres: 0
        })),
        totalOil: 0,
        oilByType: {}
    };

    try {
        return await withDb(async (db) => {
            const rows = await db.all('SELECT * FROM consolide WHERE substr(date, 7, 4) = ?', [targetYear]);
            const monthlyData = JSON.parse(JSON.stringify(defaultData.monthlyData)); // Deep copy
            let totalOil = 0;
            const oilByType: Record<string, number> = {};
            const oilColumns = ['t32', '20w50', '10w', '15w40', '90', '15w40_v', 'hvol', 'tvol', 't30', 'graisse', 't46', '15w40_quartz'];

            for (const row of rows) {
                const date = dayjs(row.date, 'DD/MM/YYYY');
                if (!date.isValid()) continue;
                
                const monthIndex = date.month();
                const entretien = row.entretien?.toString().trim().toUpperCase();

                if (entretien === 'VIDANGE,M') monthlyData[monthIndex].vidange++;
                else if (entretien === 'GR') monthlyData[monthIndex].graissage++;
                else if (entretien === 'TRANSMISSION') monthlyData[monthIndex].transmission++;
                else if (entretien === 'HYDRAULIQUE') monthlyData[monthIndex].hydraulique++;
                else if (entretien) monthlyData[monthIndex].autres++;
                
                for (const col of oilColumns) {
                    if (row[col]) {
                        const qty = parseFloat(row[col].toString().replace(',', '.') || '0');
                        if (qty > 0) {
                            totalOil += qty;
                            oilByType[col] = (oilByType[col] || 0) + qty;
                        }
                    }
                }
            }
            
            return { monthlyData, totalOil, oilByType };
        });
    } catch (e: any) {
        if (e.code === 'SQLITE_ERROR' && e.message.includes('no such table')) {
             console.warn("Table 'consolide' not found. The database might not be initialized.");
        } else {
            console.error("Failed to get monthly preventative stats:", e.message);
        }
        return defaultData;
    }
}

export async function getOperationById(id: number) {
    return withDb(async (db) => {
        const row = await db.get(`
            SELECT sc.*, m.designation, m.marque, m.categorie
            FROM suivi_curatif sc
            LEFT JOIN matrice m on sc.matricule = m.matricule
            WHERE sc.id = ?
        `, [id]);
        if (!row) return null;
        return {
            ...row,
            operation: row.panne_declaree || row.pieces || 'Opération non spécifiée',
            date_programmee: row.date_entree,
            date_realisation: row.date_sortie,
            nature: row.type_de_panne || 'non spécifié',
            niveau: 'Curatif'
        };
    });
}

export async function saveDeclaration(operationId: number, reportDataJson: string) {
    return withDb(async (db) => {
        const result = await db.run(
            `INSERT INTO declarations (operation_id, generated_at, report_data_json) VALUES (?, ?, ?)`,
            [operationId, dayjs().format(), reportDataJson]
        );
        return result.lastID;
    });
}

export async function getDeclarationById(id: number): Promise<DeclarationPanne | null> {
    return withDb(async (db) => {
        const row = await db.get('SELECT * FROM declarations WHERE id = ?', [id]);
        if (!row) return null;
        
        const reportData = JSON.parse(row.report_data_json);
        const operation = await getOperationById(row.operation_id);
        if (!operation) return null;

        const equipment = await getEquipmentDetails(operation.matricule);
        if (!equipment) return null;
        
        return {
            id: row.id,
            operation_id: row.operation_id,
            generated_at: row.generated_at,
            operation,
            equipment,
            ...reportData
        };
    });
}


export async function getDeclarationsList() {
    return withDb(async (db) => {
        try {
            const rows = await db.all(`
                SELECT d.id, d.generated_at, s.matricule, s.panne_declaree, m.designation
                FROM declarations d
                JOIN suivi_curatif s ON d.operation_id = s.id
                LEFT JOIN matrice m ON s.matricule = m.matricule
                ORDER BY d.generated_at DESC
            `);
            return rows;
        } catch (e: any) {
            console.error("Failed to get declarations list", e);
            if (e.code === 'SQLITE_ERROR' && e.message.includes('no such table')) {
                return [];
            }
            throw e;
        }
    });
}

export async function deleteDeclarationFromDb(id: number) {
    return withDb(async (db) => {
        const result = await db.run('DELETE FROM declarations WHERE id = ?', [id]);
        if (result.changes === 0) {
            throw new Error(`Declaration with id ${id} not found.`);
        }
        return { success: true };
    });
}

export async function updateDeclarationInDb(id: number, reportDataJson: string) {
    return withDb(async (db) => {
        const result = await db.run(
            `UPDATE declarations SET report_data_json = ? WHERE id = ?`,
            [reportDataJson, id]
        );
        if (result.changes === 0) {
            throw new Error(`Declaration with id ${id} not found.`);
        }
        return { success: true };
    });
}
