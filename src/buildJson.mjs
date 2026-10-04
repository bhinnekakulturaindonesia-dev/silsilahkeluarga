/**
 * buildJson.mjs
 * Konversi silsilah_gabungan.csv → silsilah_clean.json
 * Jalankan: node src/buildJson.mjs
 *
 * Kolom CSV (versi baru):
 * ID, ID_Sebelumnya, ID_Jalur, ID_Lama, Generasi, Nama_Lengkap, Jenis_Kelamin,
 * Marga, Peran, ID_Ayah, ID_Ibu, ID_Pasangan, Anak_Ke, Berapa_Bersaudara,
 * Tanggal_Lahir, Status_Hidup, Pendidikan, Pekerjaan, Alamat, Kota, HP_WA,
 * Email_Sosmed, Nama_Ayah, Nama_Ibu, Status_Data, Sumber, Catatan,
 * Status_Garis, Penerus_Marga, Catatan_Validasi
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CSV_PATH  = path.join(__dirname, 'silsilah_gabungan.csv')
const JSON_PATH = path.join(__dirname, 'silsilah_clean.json')

// ── Helpers ────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const headers = splitCSVLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = splitCSVLine(line)
    const row = {}
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] ?? '').trim() })
    rows.push(row)
  }
  return rows
}

function splitCSVLine(line) {
  const result = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur)
  return result
}

function extractYear(dateStr) {
  if (!dateStr || dateStr === 'Kosong') return null
  const m = dateStr.match(/^(\d{4})/)
  return m ? parseInt(m[1]) : null
}

function isPlaceholder(name) {
  return !name
    || name.includes('Belum terdata')
    || name.includes('UNKNOWN')
    || name === 'Kosong'
}

// ── Main ───────────────────────────────────────────────────────────────────

const csvText = fs.readFileSync(CSV_PATH, 'utf-8')
const rows = parseCSV(csvText)

// Debug: tampilkan header yang terdeteksi
const sampleRow = rows[0]
console.log('Header terdeteksi:', Object.keys(sampleRow).join(', '))

// 1. Bangun persons — filter placeholder
const persons = []
for (const r of rows) {
  if (isPlaceholder(r.Nama_Lengkap)) continue

  const birthYear = extractYear(r.Tanggal_Lahir)

  // Status_Garis: "Inti Sirait" | "Cabang/Non-Inti"
  // Penerus_Marga: "Ya" | "Tidak"
  const statusGaris   = r.Status_Garis   || ''
  const penerusMarga  = r.Penerus_Marga  === 'Ya'

  persons.push({
    person_id:       r.ID,
    name:            r.Nama_Lengkap,
    gender:          r.Jenis_Kelamin === 'L' ? 'L' : 'P',
    generation:      r.Generasi  || null,
    generation_code: r.ID_Jalur  || null,
    birth_year:      birthYear,
    birth_date:      (r.Tanggal_Lahir && r.Tanggal_Lahir !== 'Kosong') ? r.Tanggal_Lahir : null,
    death_status:    r.Status_Hidup === 'Meninggal',
    education:       r.Pendidikan   || '',
    occupation:      (r.Pekerjaan   && r.Pekerjaan   !== 'Kosong') ? r.Pekerjaan   : '',
    address:         (r.Alamat      && r.Alamat       !== 'Kosong') ? r.Alamat      : '',
    city:            (r.Kota        && r.Kota         !== 'Kosong') ? r.Kota        : '',
    phone:           (r.HP_WA       && r.HP_WA        !== 'Kosong') ? r.HP_WA       : '',
    email_social:    (r.Email_Sosmed && r.Email_Sosmed !== 'Kosong') ? r.Email_Sosmed : '',
    marga:           r.Marga        || '',
    role:            r.Peran        || '',
    status_garis:    statusGaris,
    penerus_marga:   penerusMarga,
    data_status:     r.Status_Data  || '',
    notes:           r.Catatan      || '',
    is_generated:    false,
  })
}

// Set ID valid (non-placeholder)
const validIds = new Set(persons.map(p => p.person_id))

// 2. Bangun relasi
const parent_child = []
const spouse       = []
const spousePairs  = new Set()

for (const r of rows) {
  if (isPlaceholder(r.Nama_Lengkap)) continue
  const id = r.ID

  // Parent → child
  if (r.ID_Ayah && validIds.has(r.ID_Ayah)) {
    parent_child.push({ parent_id: r.ID_Ayah, child_id: id })
  }
  if (r.ID_Ibu && validIds.has(r.ID_Ibu)) {
    parent_child.push({ parent_id: r.ID_Ibu, child_id: id })
  }

  // Spouse
  if (r.ID_Pasangan && validIds.has(r.ID_Pasangan)) {
    const a = id
    const b = r.ID_Pasangan
    const key = [a, b].sort().join('|')
    if (!spousePairs.has(key)) {
      spousePairs.add(key)
      const personA = persons.find(p => p.person_id === a)
      const personB = persons.find(p => p.person_id === b)
      if (personA && personB) {
        if (personA.gender === 'L') {
          spouse.push({ husband_id: a, wife_id: b })
        } else {
          spouse.push({ husband_id: b, wife_id: a })
        }
      }
    }
  }
}

// Dedup parent_child
const pcSeen = new Set()
const parent_child_dedup = parent_child.filter(({ parent_id, child_id }) => {
  const key = `${parent_id}|${child_id}`
  if (pcSeen.has(key)) return false
  pcSeen.add(key)
  return true
})

// 3. Tulis JSON
const output = {
  persons,
  relationships: {
    parent_child: parent_child_dedup,
    spouse,
  }
}

fs.writeFileSync(JSON_PATH, JSON.stringify(output, null, 2), 'utf-8')

console.log(`\n✅ Selesai!`)
console.log(`   Persons      : ${persons.length}`)
console.log(`   Parent-child : ${parent_child_dedup.length}`)
console.log(`   Spouse       : ${spouse.length}`)

// Statistik status_garis
const inti    = persons.filter(p => p.status_garis === 'Inti Sirait').length
const cabang  = persons.filter(p => p.status_garis === 'Cabang/Non-Inti').length
const penerus = persons.filter(p => p.penerus_marga).length
console.log(`   Inti Sirait  : ${inti}`)
console.log(`   Cabang/Non-Inti: ${cabang}`)
console.log(`   Penerus Marga: ${penerus}`)
console.log(`   Output       : ${JSON_PATH}`)
