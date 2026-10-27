# PPPoE Manager - Manajemen MikroTik Multi-Router (Node.js & MySQL)

Aplikasi web full-stack modern untuk mengelola banyak router MikroTik secara terpusat dari satu dashboard. Dilengkapi dengan antarmuka bergaya Winbox/RouterOS yang responsif, visualisasi performa jaringan, aksi massal (*bulk actions*), dan dukungan database **MySQL / MariaDB**.

---

## Fitur Utama

1. **Multi-Router Management**:
   - Agregasi data dari banyak router sekaligus dalam mode **"Semua Router"** atau pantau per router individual.
   - Dukungan tiga mode koneksi: **Winbox API (port 8728)**, **API-SSL (port 8729)**, dan **RouterOS v7 REST API (port 443 / 80)**.
   - Kredensial router disimpan terenkripsi dengan algoritma **AES-256** di server dan tidak pernah dikirim mentah ke browser.
   - Uji koneksi langsung (*Test Connection*) menampilkan System Identity, Versi RouterOS, Model Board, Uptime, CPU Load, dan Free RAM.

2. **Dukungan Database MySQL & JSON Dual-Mode**:
   - Terintegrasi penuh dengan **MySQL 8.x / MariaDB 10.x** untuk ketahanan data produksi, konkurensi tinggi, dan kemudahan backup database ISP/RT-RW Net.
   - Auto-migrasi skema: Tabel dibuat otomatis saat aplikasi pertama kali dijalankan.
   - Fallback otomatis ke `data/db.json` jika MySQL belum dikonfigurasi.

3. **Dashboard Monitoring Realtime**:
   - Metrik komprehensif: status router online/offline, total akun secret, user online, user terisolir/disabled, dan total traffic (Rx/Tx).
   - Grafik tren pengguna aktif realtime (SVG Bezier curve) dengan polling berkala yang dapat disesuaikan.
   - Tabel utilisasi CPU dan alokasi memori per router.
   - Log sesi terkini (koneksi masuk / terputus).

4. **PPP Secrets (`/ppp/secret`)**:
   - CRUD lengkap: Name, Password (dengan reveal toggle), Service, Profile, Local Address, Remote Address, Caller ID, Disabled, Comment.
   - Indikator status **Aktif / Offline** otomatis berdasarkan pencocokan sesi.
   - Aksi Massal (*Bulk Actions*): Aktifkan massal, nonaktifkan (isolir), ganti profile massal, dan hapus massal.
   - Fitur **Import CSV** dan **Export CSV**.

5. **PPP Active (`/ppp/active`)**:
   - Monitoring pelanggan online secara realtime dengan laju traffic Tx/Rx per klien (sinkronisasi queue dinamis).
   - Fitur **Kick / Disconnect** per klien atau **Bulk Disconnect** seluruh sesi aktif.

6. **PPP Profiles (`/ppp/profile`)**:
   - CRUD profil bandwidth dan konfigurasi pool IP.
   - Aksi Massal: Ganti DNS massal, ganti limitasi bandwidth massal, ganti Local/Remote address massal, dan hapus massal.

7. **Simple Queues & IP Pools**:
   - Manajemen hierarki antrean bandwidth parent-child.
   - Pengelolaan IP Pool dinamis untuk alokasi IP pelanggan PPPoE.

8. **Hak Akses Multi-User & Audit Trail**:
   - Role-Based Access Control: `Superadmin`, `Operator`, `Technician`.
   - Pembatasan menu spesifik per user.
   - Catatan audit lengkap setiap perubahan konfigurasi router.

---

## Panduan Lengkap Instalasi di Ubuntu Server (MySQL)

Panduan ini berlaku untuk **Ubuntu Server 20.04, 22.04, atau 24.04 LTS**.

### Langkah 1: Update Sistem & Install Paket Pendukung
Buka terminal SSH server Ubuntu Anda dan jalankan:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential ufw
```

---

### Langkah 2: Install Node.js (Versi 20 LTS atau 22 LTS)
Gunakan NodeSource repository:

```bash
# Tambahkan repo Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -

# Install Node.js & npm
sudo apt install -y nodejs

# Verifikasi versi terpasang
node -v   # Minimal v20.x atau v22.x
npm -v
```

---

### Langkah 3: Install & Amankan MySQL Server

```bash
# Install MySQL Server
sudo apt install -y mysql-server

# Pastikan service MySQL berjalan
sudo systemctl enable --now mysql
sudo systemctl status mysql
```

Amankan instalasi MySQL (opsional namun disarankan):
```bash
sudo mysql_secure_installation
```

---

### Langkah 4: Buat Database & User MySQL untuk PPPoE Manager

Masuk ke konsol MySQL sebagai root:
```bash
sudo mysql
```

Jalankan perintah SQL berikut (ganti `PasswordKuatAnda123!` dengan password aman pilihan Anda):

```sql
-- 1. Buat database dengan encoding UTF8mb4
CREATE DATABASE pppoe_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Buat user khusus aplikasi
CREATE USER 'pppoe_user'@'localhost' IDENTIFIED BY 'PasswordKuatAnda123!';

-- 3. Berikan hak akses penuh ke database pppoe_manager
GRANT ALL PRIVILEGES ON pppoe_manager.* TO 'pppoe_user'@'localhost';
FLUSH PRIVILEGES;

-- 4. Keluar dari MySQL
EXIT;
```

---

### Langkah 5: Clone Repositori & Install Dependencies

Pilih direktori instalasi (misalnya di `/var/www/pppoe-manager` atau di home directory `~/pppoe-manager`):

```bash
# Clone source code
git clone https://github.com/anmuslim/whusnetpppoemanager.git /var/www/pppoe-manager

# Pindah ke direktori proyek
cd /var/www/pppoe-manager

# Install seluruh dependency
npm install
```

---

### Langkah 6: Konfigurasi File Lingkungan (`.env`)

Buat dua secret acak terlebih dahulu (jalankan dua kali, satu untuk `JWT_SECRET`, satu untuk `ENCRYPTION_KEY`):
```bash
openssl rand -hex 32
```

Salin template konfigurasi lalu isi:
```bash
cp .env.example .env
nano .env
chmod 600 .env
```

> **Penting:** Jangan ubah `ENCRYPTION_KEY` setelah router ditambahkan. Password router yang sudah tersimpan tidak bisa didekripsi dengan kunci baru.

Sesuaikan isi file `.env`:
```env
PORT=3000
NODE_ENV=production

# Ganti dengan string acak minimal 32 karakter untuk keamanan
JWT_SECRET=<hasil openssl pertama>
ENCRYPTION_KEY=<hasil openssl kedua>

# Konfigurasi Database MySQL
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=pppoe_user
DB_PASSWORD=PasswordKuatAnda123!
DB_NAME=pppoe_manager
```
Simpan file dengan menekan `Ctrl + O`, lalu `Enter`, kemudian keluar dengan `Ctrl + X`.

---

### Langkah 7: Inisialisasi Database & Build Frontend

Jalankan skrip pemeriksaan koneksi & pembuatan tabel otomatis:
```bash
npm run db:init
```
*Output akan menampilkan:*
```text
✅ Berhasil terhubung ke MySQL Server! (Versi: 8.0.x)
✅ Semua tabel database berhasil diverifikasi/dibuat:
   - routers
   - users
   - audit_logs
   - recent_events
   - demo_data
🎉 Database MySQL siap digunakan oleh PPPoE Manager!
```

Selanjutnya, bangun aplikasi frontend (hasilnya di folder `dist/`):
```bash
npm run build
```

---

### Langkah 8: Jalankan Aplikasi di Latar Belakang (PM2)

Gunakan **PM2 Process Manager** agar aplikasi otomatis berjalan di background dan otomatis menyala kembali jika server reboot:

```bash
# Install PM2 secara global
sudo npm install -g pm2

# Jalankan aplikasi PPPoE Manager (memakai ecosystem.config.cjs)
pm2 start ecosystem.config.cjs

# Simpan status PM2 agar berjalan otomatis saat boot
pm2 save
pm2 startup
```
*(Salin dan jalankan perintah `sudo env PATH=...` yang ditampilkan oleh output `pm2 startup` jika ada).*

Untuk memantau log aplikasi kapan saja:
```bash
pm2 logs pppoe-manager
pm2 status
```

---

### Langkah 9: Konfigurasi Nginx Reverse Proxy & Domain/IP (Opsional namun Sangat Direkomendasikan)

Install Nginx:
```bash
sudo apt install -y nginx
```

Buat konfigurasi virtual host baru:
```bash
sudo nano /etc/nginx/sites-available/pppoe-manager
```

Isikan konfigurasi berikut (ganti `pppoe.domainanda.com` dengan domain Anda atau IP server):
```nginx
server {
    listen 80;
    server_name pppoe.domainanda.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Aktifkan konfigurasi dan restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/pppoe-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Jika memiliki domain, pasang sertifikat SSL gratis (HTTPS):
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pppoe.domainanda.com
```

Buka port firewall:
```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow 22/tcp
sudo ufw enable
```

---

### Langkah 10: Akses Aplikasi & Login Pertama Kali

1. Buka browser: `http://ip-server-anda` (atau `https://pppoe.domainanda.com`). Jika belum memakai Nginx, gunakan `http://ip-server-anda:3000`.
2. Login menggunakan akun Superadmin bawaan:
   - **Username**: `admin`
   - **Password**: `admin123`
3. Segera ganti password default melalui menu profil / akun Anda demi keamanan.

---

## Konfigurasi di MikroTik RouterOS

Agar PPPoE Manager dapat terhubung ke MikroTik Anda, jalankan perintah berikut di Terminal Winbox atau SSH MikroTik:

```routeros
# 1. Aktifkan service API standar MikroTik (port 8728)
/ip service enable api

# 2. Buat grup dengan hak akses yang dibutuhkan
/user group add name=pppoe-api-group policy=api,read,write,!ftp,!reboot,!policy,!test,!winbox,!password,!sniff

# 3. Buat user API khusus untuk PPPoE Manager
/user add name=api-pppoe group=pppoe-api-group password="GantiPasswordKuat123!" address=IP_SERVER_UBUNTU/32
```

*(Ganti `IP_SERVER_UBUNTU` dengan IP server PPPoE Manager agar API MikroTik hanya bisa diakses dari server tersebut. Jangan gunakan `0.0.0.0/0`.)*

---

## Perintah Perawatan (Maintenance)

- **Cek Status Database**: `npm run db:init`
- **Restart Aplikasi**: `pm2 restart pppoe-manager`
- **Update Aplikasi**:
  ```bash
  git pull && npm install && npm run build && pm2 restart pppoe-manager
  ```
- **Cek Log Realtime**: `pm2 logs pppoe-manager`
- **Backup Database MySQL**:
  ```bash
  mysqldump -u pppoe_user -p pppoe_manager > backup_pppoe_$(date +%F).sql
  ```
- **Restore Database MySQL**:
  ```bash
  mysql -u pppoe_user -p pppoe_manager < backup_pppoe_2026-10-26.sql
  ```
