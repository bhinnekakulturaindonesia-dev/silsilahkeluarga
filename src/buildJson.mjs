/**
 * buildJson.mjs
 * Konversi silsilah_gabungan.csv → silsilah_clean.json
 * Jalankan: node src/buildJson.mjs
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

/** Split satu baris CSV dengan benar (handle koma di dalam tanda kutip) */
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
  if (!dateStr) return null
  const m = dateStr.match(/^(\d{4})/)
  return m ? parseInt(m[1]) : null
}

function isPlaceholder(name) {
  return !name || name.includes('Belum terdata') || name.includes('UNKNOWN')
}

// ── Main ───────────────────────────────────────────────────────────────────

const csvText = fs.readFileSync(CSV_PATH, 'utf-8')
const rows = parseCSV(csvText)

// 1. Bangun persons — filter placeholder
const persons = []
for (const r of rows) {
  if (isPlaceholder(r.Nama_Lengkap)) continue

  const birthYear = extractYear(r.Tanggal_Lahir)

  persons.push({
    person_id:       r.ID,
    name:            r.Nama_Lengkap,
    gender:          r.Jenis_Kelamin === 'L' ? 'L' : 'P',
    generation:      r.Generasi || null,
    generation_code: r.ID_Jalur  || null,
    birth_year:      birthYear,
    birth_date:      r.Tanggal_Lahir || null,
    death_status:    r.Status_Hidup === 'Meninggal' ? true : false,
    education:       r.Pendidikan   || '',
    occupation:      r.Pekerjaan    || '',
    address:         r.Alamat       || '',
    city:            r.Kota         || '',
    phone:           r.HP_WA        || '',
    email_social:    r.Email_Sosmed || '',
    marga:           r.Marga        || '',
    role:            r.Peran        || '',
    data_status:     r.Status_Data  || '',
    notes:           r.Catatan      || '',
    is_generated:    false,
  })
}

// Buat set ID valid (non-placeholder)
const validIds = new Set(persons.map(p => p.person_id))

// 2. Bangun relasi

const parent_child = []  // { parent_id, child_id }
const spouse       = []  // { husband_id, wife_id }

// Lacak pasangan yang sudah dicatat agar tidak duplikat
const spousePairs = new Set()

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
      // Tentukan siapa husband/wife berdasar gender
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

// Hapus duplikat parent_child (bisa muncul dari sisi ayah DAN sisi anak yg sama)
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

console.log(`✅ Selesai!`)
console.log(`   Persons      : ${persons.length}`)
console.log(`   Parent-child : ${parent_child_dedup.length}`)
console.log(`   Spouse       : ${spouse.length}`)
console.log(`   Output       : ${JSON_PATH}`)
