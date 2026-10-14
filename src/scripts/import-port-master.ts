/**
 * ╔═════════════════════════════════════════════════════════════════════════════╗
 * ║        AGRICOM CRM - ONE-TIME PORT MASTER CSV SEEDER SCRIPT                 ║
 * ╠═════════════════════════════════════════════════════════════════════════════╣
 * ║  Usage: npm run import:ports                                                ║
 * ║                                                                             ║
 * ║  Reads:                                                                     ║
 * ║   - backend/public/country_port_shipping_lines.csv                          ║
 * ║   - backend/public/country_port_summary.csv                                 ║
 * ║                                                                             ║
 * ║  Guarantees:                                                                ║
 * ║   - Matches existing countries without duplicates                           ║
 * ║   - Creates/skips ports and shipping lines idempotently                     ║
 * ║   - Syncs port_shipping_lines relations without duplicate mappings          ║
 * ║   - Executes inside a single database transaction                           ║
 * ║   - Logs any row errors and continues importing remaining rows              ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Sequelize } from 'sequelize-typescript';
import { Country } from '../masters/country/country.model';
import { Port, PortShippingLine, PortType } from '../masters/port/port.model';
import { ShippingLine } from '../masters/shipping-line/shipping-line.model';

dotenv.config();

// ─── Database Setup (Isolated for Standalone Execution) ────────────────────────
const sequelize = new Sequelize(
  process.env.DB_NAME || 'Agricom_db1',
  process.env.DB_USERNAME || 'postgres',
  process.env.DB_PASSWORD || 'admin',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    logging: false,
    models: [Country, Port, ShippingLine, PortShippingLine],
  },
);

// ─── CSV Parser Helpers ───────────────────────────────────────────────────────
interface ParsedRow {
  rowNumber: number;
  data: Record<string, string>;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

function parseCsvFile(filePath: string): ParsedRow[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found at: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const tokens = parseCsvLine(lines[i]);
    const rowObj: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) {
      rowObj[headers[h]] = tokens[h] !== undefined ? tokens[h].trim() : '';
    }
    rows.push({ rowNumber: i + 1, data: rowObj });
  }

  return rows;
}

// ─── Main Import Runner ───────────────────────────────────────────────────────
async function runImport() {
  console.log('\n🚀 Starting Port Master & Shipping Line Master CSV Import...\n');

  await sequelize.authenticate();
  console.log('✅ Connected to database:', process.env.DB_NAME || 'Agricom_db1');

  // Paths to CSVs
  const publicDir = path.resolve(__dirname, '../../public');
  const shippingLinesCsvPath = path.join(publicDir, 'country_port_shipping_lines.csv');
  const summaryCsvPath = path.join(publicDir, 'country_port_summary.csv');

  console.log(`📂 Reading: ${summaryCsvPath}`);
  const summaryRows = parseCsvFile(summaryCsvPath);
  console.log(`   Found ${summaryRows.length} summary rows.`);

  console.log(`📂 Reading: ${shippingLinesCsvPath}`);
  const detailedRows = parseCsvFile(shippingLinesCsvPath);
  console.log(`   Found ${detailedRows.length} detailed carrier rows.\n`);

  // Start single database transaction
  const transaction = await sequelize.transaction();

  try {
    // ── 1. Load Existing Countries & Build Smart Matcher ─────────────────────
    const allCountries = await Country.findAll({ transaction });
    const byExact = new Map<string, Country>();
    const byClean = new Map<string, Country>();
    const byIso2 = new Map<string, Country>();

    const cleanStr = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const c of allCountries) {
      byExact.set(c.name.toLowerCase().trim(), c);
      byClean.set(cleanStr(c.name), c);
      if (c.iso2Code) {
        byIso2.set(c.iso2Code.toLowerCase().trim(), c);
      }
    }

    const countryAliases: Record<string, string> = {
      'hong kong (sar)': 'hong kong s.a.r.',
      'ivory coast': "cote d'ivoire (ivory coast)",
      'south korea': 'korea, republic of',
      'taiwan': 'taiwan',
      'vietnam': 'vietnam',
    };

    function matchCountry(rawName?: string, unlocode?: string): Country | null {
      if (!rawName) return null;
      const lower = rawName.toLowerCase().trim();
      if (byExact.has(lower)) return byExact.get(lower)!;

      if (countryAliases[lower] && byExact.has(countryAliases[lower])) {
        return byExact.get(countryAliases[lower])!;
      }

      const cClean = cleanStr(rawName);
      if (byClean.has(cClean)) return byClean.get(cClean)!;

      // Match via 2-char UN_LOCODE ISO prefix if available
      if (unlocode && unlocode.length >= 2) {
        const isoPrefix = unlocode.substring(0, 2).toLowerCase();
        if (byIso2.has(isoPrefix)) return byIso2.get(isoPrefix)!;
      }

      // Partial fallback
      for (const c of allCountries) {
        const dbClean = cleanStr(c.name);
        if (dbClean.includes(cClean) || cClean.includes(dbClean)) {
          return c;
        }
      }

      return null;
    }

    // ── 2. Load Existing Ports, Carriers, & Relations ─────────────────────────
    const existingPorts = await Port.findAll({ transaction });
    const initialDbPortKeys = new Set<string>();
    const portCache = new Map<string, Port>();

    for (const p of existingPorts) {
      const key = `${p.countryId}:::${p.portName.toLowerCase().trim()}`;
      initialDbPortKeys.add(key);
      portCache.set(key, p);
    }

    const existingLines = await ShippingLine.findAll({ transaction });
    const initialDbLineKeys = new Set<string>();
    const lineCache = new Map<string, ShippingLine>();

    for (const l of existingLines) {
      const key = l.lineName.toLowerCase().trim();
      initialDbLineKeys.add(key);
      lineCache.set(key, l);
    }

    const existingRelations = await PortShippingLine.findAll({ transaction });
    const relationCache = new Set<string>();

    for (const r of existingRelations) {
      relationCache.add(`${r.portId}:::${r.shippingLineId}`);
    }

    // ── 3. Initialize Counters & Tracking Sets ───────────────────────────────
    const matchedCountries = new Set<number>();
    const portsSkipped = new Set<string>();
    const linesSkipped = new Set<string>();

    let portsCreated = 0;
    let shippingLinesCreated = 0;
    let relationsCreated = 0;
    let relationsSkipped = 0;

    // Helper to generate code if missing
    function makeLineCode(name: string): string {
      const words = name.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/);
      if (words.length === 1) return words[0].substring(0, 4).toUpperCase();
      return words.map((w) => w[0]).join('').substring(0, 6).toUpperCase();
    }

    // ── 4. Process Summary CSV (Ensures all 107 Ports & UN_LOCODEs) ───────────
    for (const row of summaryRows) {
      try {
        const countryName = row.data['Country'];
        const portName = row.data['Port'];
        const unlocode = row.data['UN_LOCODE'];
        const rawLines = row.data['Shipping_Lines'];

        if (!countryName || !portName) {
          console.warn(`[Summary CSV Row ${row.rowNumber}] Skipped: Missing Country or Port.`);
          continue;
        }

        const country = matchCountry(countryName, unlocode);
        if (!country) {
          console.warn(`[Summary CSV Row ${row.rowNumber}] Country not found for: "${countryName}".`);
          continue;
        }
        matchedCountries.add(country.id);

        const pKey = `${country.id}:::${portName.toLowerCase().trim()}`;
        let port = portCache.get(pKey);

        if (port) {
          if (initialDbPortKeys.has(pKey)) {
            portsSkipped.add(pKey);
          }
          if (!port.unlocode && unlocode) {
            await port.update({ unlocode: unlocode.trim() }, { transaction });
          }
        } else {
          port = await Port.create(
            {
              countryId: country.id,
              portName: portName.trim(),
              portCode: unlocode ? unlocode.trim() : null,
              unlocode: unlocode ? unlocode.trim() : null,
              portType: PortType.SEA,
              isActive: true,
            },
            { transaction },
          );
          portCache.set(pKey, port);
          portsCreated++;
        }

        // Process any shipping lines in summary
        if (rawLines) {
          const names = rawLines.split(';').map((s) => s.trim()).filter(Boolean);
          for (const lineName of names) {
            const lKey = lineName.toLowerCase().trim();
            let line = lineCache.get(lKey);
            if (line) {
              if (initialDbLineKeys.has(lKey)) {
                linesSkipped.add(lKey);
              }
            } else {
              line = await ShippingLine.create(
                {
                  lineName: lineName.trim(),
                  lineCode: makeLineCode(lineName),
                  isActive: true,
                },
                { transaction },
              );
              lineCache.set(lKey, line);
              shippingLinesCreated++;
            }

            const rKey = `${port.id}:::${line.id}`;
            if (relationCache.has(rKey)) {
              relationsSkipped++;
            } else {
              await PortShippingLine.create(
                {
                  portId: port.id,
                  shippingLineId: line.id,
                  isActive: true,
                },
                { transaction },
              );
              relationCache.add(rKey);
              relationsCreated++;
            }
          }
        }
      } catch (rowErr: any) {
        console.error(`[Summary CSV Row ${row.rowNumber}] Error: ${rowErr?.message || rowErr}`);
      }
    }

    // ── 5. Process Detailed Shipping Lines CSV (Syncs Alliances & Carriers) ───
    for (const row of detailedRows) {
      try {
        const countryName = row.data['Country'];
        const portName = row.data['Port'];
        const unlocode = row.data['UN_LOCODE'];
        const lineName = row.data['Shipping_Line'];
        const alliance = row.data['Alliance_2026'];

        if (!countryName || !portName || !lineName) {
          console.warn(`[Detailed CSV Row ${row.rowNumber}] Skipped: Incomplete data.`);
          continue;
        }

        const country = matchCountry(countryName, unlocode);
        if (!country) {
          console.warn(`[Detailed CSV Row ${row.rowNumber}] Country not found for: "${countryName}".`);
          continue;
        }
        matchedCountries.add(country.id);

        // Check or create Port
        const pKey = `${country.id}:::${portName.toLowerCase().trim()}`;
        let port = portCache.get(pKey);

        if (port) {
          if (initialDbPortKeys.has(pKey)) {
            portsSkipped.add(pKey);
          }
          if (!port.unlocode && unlocode) {
            await port.update({ unlocode: unlocode.trim() }, { transaction });
          }
        } else {
          port = await Port.create(
            {
              countryId: country.id,
              portName: portName.trim(),
              portCode: unlocode ? unlocode.trim() : null,
              unlocode: unlocode ? unlocode.trim() : null,
              portType: PortType.SEA,
              isActive: true,
            },
            { transaction },
          );
          portCache.set(pKey, port);
          portsCreated++;
        }

        // Check or create Shipping Line
        const lKey = lineName.toLowerCase().trim();
        let line = lineCache.get(lKey);

        if (line) {
          if (initialDbLineKeys.has(lKey)) {
            linesSkipped.add(lKey);
          }
        } else {
          line = await ShippingLine.create(
            {
              lineName: lineName.trim(),
              lineCode: makeLineCode(lineName),
              isActive: true,
            },
            { transaction },
          );
          lineCache.set(lKey, line);
          shippingLinesCreated++;
        }

        // Check or create Relation
        const rKey = `${port.id}:::${line.id}`;
        if (relationCache.has(rKey)) {
          relationsSkipped++;
        } else {
          await PortShippingLine.create(
            {
              portId: port.id,
              shippingLineId: line.id,
              isActive: true,
              remarks: alliance ? `Alliance: ${alliance.trim()}` : null,
            },
            { transaction },
          );
          relationCache.add(rKey);
          relationsCreated++;
        }
      } catch (rowErr: any) {
        console.error(`[Detailed CSV Row ${row.rowNumber}] Error: ${rowErr?.message || rowErr}`);
      }
    }

    // Commit single transaction
    await transaction.commit();
    console.log('🎉 Transaction committed successfully.\n');

    // ── 6. Final Print as Requested ──────────────────────────────────────────
    console.log('Countries matched:', matchedCountries.size);
    console.log('Ports created:', portsCreated);
    console.log('Ports skipped:', portsSkipped.size);
    console.log('Shipping Lines created:', shippingLinesCreated);
    console.log('Shipping Lines skipped:', linesSkipped.size);
    console.log('Relations created:', relationsCreated);
    console.log('Relations skipped:', relationsSkipped);
    console.log('\n✅ Port Master seed import completed successfully.');
  } catch (fatalError: any) {
    await transaction.rollback();
    console.error('❌ Fatal error during import. Transaction rolled back:', fatalError?.message || fatalError);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

runImport().catch((e) => {
  console.error('Unhandled script error:', e);
  process.exit(1);
});
