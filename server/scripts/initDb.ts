import dotenv from 'dotenv';
import { testMySQLConnection, initMySQLTables, getMySQLConfig } from '../mysql.js';

dotenv.config();

async function main() {
  console.log('========================================================');
  console.log('  PPPoE Manager - MySQL Database Initializer & Checker  ');
  console.log('========================================================\n');

  const config = getMySQLConfig();
  console.log('Target Konfigurasi:');
  console.log(`- Host     : ${config.host}:${config.port}`);
  console.log(`- User     : ${config.user}`);
  console.log(`- Database : ${config.database}\n`);

  console.log('⏳ Menguji koneksi ke server MySQL...');
  const testRes = await testMySQLConnection();
  if (!testRes.success) {
    console.error('❌ Gagal terhubung ke MySQL:');
    console.error(`   ${testRes.error}`);
    console.error('\nPastikan:');
    console.error('1. Layanan MySQL sedang berjalan di Ubuntu: `sudo systemctl status mysql`');
    console.error('2. Database telah dibuat: `CREATE DATABASE pppoe_manager;`');
    console.error('3. User dan password di file .env sudah sesuai.');
    process.exit(1);
  }

  console.log(`✅ Berhasil terhubung ke MySQL Server! (Versi: ${testRes.version})`);
  console.log('⏳ Memverifikasi dan membuat tabel (CREATE TABLE IF NOT EXISTS)...');

  try {
    await initMySQLTables();
    console.log('✅ Semua tabel database berhasil diverifikasi/dibuat:');
    console.log('   - routers');
    console.log('   - users');
    console.log('   - audit_logs');
    console.log('   - recent_events');
    console.log('   - demo_data');
    console.log('\n🎉 Database MySQL siap digunakan oleh PPPoE Manager!\n');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Terjadi kesalahan saat inisialisasi tabel:', err.message);
    process.exit(1);
  }
}

main();
