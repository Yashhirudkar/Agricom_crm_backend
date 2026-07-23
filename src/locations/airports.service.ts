import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

export interface Airport {
  code: string;
  name: string;
  country: string;
  type: string;
}

@Injectable()
export class AirportsService implements OnModuleInit {
  private readonly logger = new Logger(AirportsService.name);
  
  // Storing airports mapped by country for fast O(1) initial filtering
  private airportsByCountry = new Map<string, Airport[]>();

  async onModuleInit() {
    await this.loadAirports();
  }

  private async loadAirports() {
    this.logger.log('Loading airports from CSV...');
    const csvPath = path.join(process.cwd(), 'public', 'airports.csv');
    
    if (!fs.existsSync(csvPath)) {
      this.logger.warn(`Airports CSV not found at ${csvPath}`);
      return;
    }

    const fileStream = fs.createReadStream(csvPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let isHeader = true;
    let loadedCount = 0;

    for await (const line of rl) {
      if (isHeader) {
        isHeader = false;
        continue;
      }

      // CSV parsing (naive but fast, ignoring commas inside quotes since the data format is relatively stable)
      // Format: "id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code",...
      const columns = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g);
      
      if (!columns || columns.length < 14) continue;
      
      // Clean up quotes and leading commas
      const cleanCol = (idx: number) => {
        let val = columns[idx]?.trim() || '';
        if (val.startsWith(',')) val = val.substring(1);
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        }
        return val;
      };

      const type = cleanCol(2);
      // We only want commercial airports (large and medium)
      if (type !== 'large_airport' && type !== 'medium_airport') {
        continue;
      }

      const name = cleanCol(3);
      const iso_country = cleanCol(8);
      const iata_code = cleanCol(13);
      const icao_code = cleanCol(12);
      
      // We need at least an IATA or ICAO code to identify the airport
      const code = iata_code || icao_code;
      if (!code) continue;

      const airport: Airport = {
        code,
        name,
        country: iso_country,
        type,
      };

      if (!this.airportsByCountry.has(iso_country)) {
        this.airportsByCountry.set(iso_country, []);
      }
      this.airportsByCountry.get(iso_country)!.push(airport);
      loadedCount++;
    }

    this.logger.log(`Successfully loaded ${loadedCount} commercial airports into memory.`);
  }

  /**
   * Search airports optimally
   */
  searchAirports(countryCode?: string, query?: string, limit: number = 5): Airport[] {
    let pool: Airport[] = [];

    // Filter by country if provided
    if (countryCode) {
      pool = this.airportsByCountry.get(countryCode.toUpperCase()) || [];
    } else {
      // Flatten all if no country provided (rare case, but supported)
      for (const [, airports] of this.airportsByCountry) {
        pool.push(...airports);
      }
    }

    // Filter by search query if provided
    if (query) {
      const q = query.toLowerCase();
      pool = pool.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.code.toLowerCase().includes(q)
      );
    }

    // Return only the requested limit
    return pool.slice(0, limit);
  }
}
