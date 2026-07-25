/**
 * ╔════════════════════════════o══════════════════════════════════╗
 * ║          AGRICOM CRM - MASTER MIGRATION RUNNER                ║
 * ╠═══════════════════════════════════════════════════════════════╣
 * ║  Usage:                                                       ║
 * ║   npm run migrate              → Run all pending phases       ║
 * ║   npm run migrate:phase 01     → Run specific phase           ║
 * ║   npm run migrate:status       → Show status of all phases    ║
 * ║   npm run migrate:fresh        → Drop all + re-run all        ║
 * ╚════════════════════════════o══════════════════════════════════╝
 */

import * as dotenv from 'dotenv';
import { Sequelize, QueryInterface, DataTypes } from 'sequelize';
import { ALL_PHASES, MigrationPhase } from './index';

dotenv.config();

// ─═o═────═o═────═o═──────── Database Connection ────═o═─────═o═──────═o═───═o═──────═o═─────═o═────═o═────═o═────═o═───────────

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'Agricom_db',
  logging: false,
});

const queryInterface: QueryInterface = sequelize.getQueryInterface();

// ─═o═────═o═────═o═──────── Migration Log Table ────═o═─────═o═──────═o═───═o═──────═o═─────═o═────═o═────═o═────═o═────────

const LOG_TABLE = 'migrations_log';

async function ensureLogTable(): Promise<void> {
  await queryInterface.createTable(
    LOG_TABLE,
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      phase: { type: DataTypes.STRING(10), allowNull: false, unique: true },
      name: { type: DataTypes.TEXT, allowNull: false },
      ranAt: { type: DataTypes.DATE, allowNull: false, field: 'ranAt' },
      direction: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'up' },
    },
    { ifNotExists: true } as any,
  );
}

async function getRanPhases(): Promise<string[]> {
  const rows = (await sequelize.query(`SELECT phase FROM "${LOG_TABLE}" WHERE direction = 'up'`)) as any[];
  return rows[0].map((r: any) => r.phase);
}

async function logPhase(phase: string, name: string, direction: 'up' | 'down'): Promise<void> {
  if (direction === 'up') {
    await sequelize.query(
      `INSERT INTO "${LOG_TABLE}" (phase, name, "ranAt", direction) VALUES ('${phase}', '${name.replace(/'/g, "''")}', NOW(), 'up')
       ON CONFLICT (phase) DO UPDATE SET direction = 'up', "ranAt" = NOW()`,
    );
  } else {
    await sequelize.query(
      `UPDATE "${LOG_TABLE}" SET direction = 'down', "ranAt" = NOW() WHERE phase = '${phase}'`,
    );
  }
}

// ─═o═────═o═────═o═────═o═────═o═────═o═──────── Pretty Helpers ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────

function box(msg: string): void {
  const line = '═'.repeat(msg.length + 4);
  console.log(`\n╔${line}╗`);
  console.log(`║  ${msg}  ║`);
  console.log(`╚${line}╝\n`);
}

function printPhaseHeader(p: MigrationPhase): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  🚀 Phase ${p.phase}: ${p.name}`);
  console.log(`${'─'.repeat(60)}`);
}

// ─═o═────═o═────═o═────═o═────═o═────═o═──────── Commands ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────

/** Run all pending phases */
async function runAll(): Promise<void> {
  box('Running All Pending Phases');
  await ensureLogTable();
  const ran = await getRanPhases();

  const pending = ALL_PHASES.filter((p) => !ran.includes(p.phase));

  if (pending.length === 0) {
    console.log('✨ All phases already run. Nothing to do.');
    return;
  }

  console.log(`📋 Pending phases: ${pending.map((p) => p.phase).join(', ')}`);

  for (const p of pending) {
    printPhaseHeader(p);
    await p.up(queryInterface);
    await logPhase(p.phase, p.name, 'up');
    console.log(`  ✅ Phase ${p.phase} completed`);
  }

  box(`✅ Done! ${pending.length} phase(s) migrated`);
}

/** Run a specific single phase */
async function runPhase(phaseNum: string): Promise<void> {
  const p = ALL_PHASES.find((ph) => ph.phase === phaseNum.padStart(2, '0'));
  if (!p) {
    console.error(`❌ Phase "${phaseNum}" not found. Available: ${ALL_PHASES.map((x) => x.phase).join(', ')}`);
    process.exit(1);
  }

  await ensureLogTable();
  const ran = await getRanPhases();

  if (ran.includes(p.phase)) {
    console.log(`⚠️  Phase ${p.phase} already ran. Re-running anyway...`);
  }

  printPhaseHeader(p);
  await p.up(queryInterface);
  await logPhase(p.phase, p.name, 'up');
  console.log(`\n✅ Phase ${p.phase} completed successfully`);
}

/** Show status of all phases */
async function showStatus(): Promise<void> {
  box('Migration Status');
  await ensureLogTable();
  const ran = await getRanPhases();

  console.log(`${'─'.repeat(65)}`);
  console.log(`  ${'Phase'.padEnd(8)} ${'Status'.padEnd(12)} ${'Name'}`);
  console.log(`${'─'.repeat(65)}`);

  for (const p of ALL_PHASES) {
    const status = ran.includes(p.phase) ? '✅ DONE   ' : '⏳ PENDING';
    const shortName = p.name.length > 45 ? p.name.substring(0, 42) + '...' : p.name;
    console.log(`  Phase ${p.phase}  ${status}  ${shortName}`);
  }

  console.log(`${'─'.repeat(65)}`);
  console.log(`\n  Total: ${ALL_PHASES.length} phases | Done: ${ran.length} | Pending: ${ALL_PHASES.length - ran.length}\n`);
}

/** Drop all tables & re-run all phases */
async function freshMigrate(): Promise<void> {
  box('⚠️  FRESH MIGRATION - Dropping All Tables');
  console.log('WARNING: This will DROP all tables and re-create them.\n');

  await ensureLogTable();

  // Run down in reverse order
  console.log('📉 Running down migrations in reverse...\n');
  for (const p of [...ALL_PHASES].reverse()) {
    try {
      process.stdout.write(`  Phase ${p.phase}: dropping...`);
      await p.down(queryInterface);
      process.stdout.write(' ✅\n');
    } catch (e: any) {
      process.stdout.write(` ⚠️  (${e.message})\n`);
    }
  }

  // Drop log table too
  await sequelize.query(`DROP TABLE IF EXISTS "${LOG_TABLE}"`).catch(() => { });
  console.log('\n✅ All tables dropped\n');

  // Run all again
  await runAll();
}

// ─═o═────═o═────═o═────═o═────═o═────═o═──────── Main Entry ─═o═────═o═────═o═──────═o═────═o═────═o═──────═o═────═o═────═o═────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const param = args[1];

  console.log('\n🌾 Agricom CRM Migration Runner');
  console.log(`   DB: ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT}\n`);

  try {
    await sequelize.authenticate();
    console.log('   ✅ Database connected\n');
  } catch (err: any) {
    console.error('   ❌ Cannot connect to database:', err.message);
    process.exit(1);
  }

  try {
    if (command === '--status') {
      await showStatus();
    } else if (command === '--fresh') {
      await freshMigrate();
    } else if (command === '--phase') {
      if (!param) {
        console.error('❌ Please specify phase number. Example: npm run migrate:phase 01');
        process.exit(1);
      }
      await runPhase(param);
    } else {
      // Default: run all pending
      await runAll();
    }
  } catch (err: any) {
    console.error('\n❌ Migration failed:', err.message);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
