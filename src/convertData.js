import rawData from './silsilah_clean.json'

// Ambil semua foto di src/assets/photos otomatis saat build.
// Nama file HARUS sama persis dengan person_id, contoh: 3.21.jpg, 4.1-P.png
const photoModules = import.meta.glob(
  '/src/assets/photos/*.{jpg,jpeg,png,JPG,JPEG,PNG}',
  { eager: true, import: 'default' }
)

// index: { "3.21": "/assets/3.21-abc123.jpg", ... }
const photoIndex = {}
for (const path in photoModules) {
  const filename = path.split('/').pop()
  const personId = filename.substring(0, filename.lastIndexOf('.'))
  photoIndex[personId] = photoModules[path]
}

function getPhotoUrl(person_id) {
  return photoIndex[person_id] || undefined
}

/**
 * Urutan anak berdasarkan generation_code (ID_Jalur).
 * Format: "1.5.1.1" → ambil angka terakhir.
 */
function getChildOrder(person) {
  if (!person.generation_code) return 999
  const parts = person.generation_code.split('.')
  return parseInt(parts[parts.length - 1]) || 999
}

/**
 * Format tanggal lahir: "1976-10-21" → "21 Okt 1976"
 * Kalau tidak ada tanggal lengkap, gunakan tahun saja.
 */
const BULAN_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

function formatBirthDate(person) {
  if (person.birth_date) {
    const parts = person.birth_date.split('-')
    if (parts.length === 3) {
      const [y, m, d] = parts
      const bulan = BULAN_ID[parseInt(m, 10) - 1] || m
      return `${parseInt(d, 10)} ${bulan} ${y}`
    }
  }
  return person.birth_year ? String(person.birth_year) : ''
}

export function convertToF3() {
  const { persons, relationships } = rawData
  const { parent_child, spouse } = relationships

  return persons.map(person => {
    const id = person.person_id

    // Cari pasangan
    const spouses = spouse
      .filter(s => s.husband_id === id || s.wife_id === id)
      .map(s => s.husband_id === id ? s.wife_id : s.husband_id)

    // Cari anak, urutkan berdasarkan generation_code
    const childIds = [...new Set(
      parent_child
        .filter(r => r.parent_id === id)
        .map(r => r.child_id)
    )]

    const children = childIds
      .map(childId => persons.find(p => p.person_id === childId))
      .filter(Boolean)
      .sort((a, b) => getChildOrder(a) - getChildOrder(b))
      .map(p => p.person_id)

    // Cari orang tua
    const parents = parent_child
      .filter(r => r.child_id === id)
      .map(r => r.parent_id)

    const photoUrl = getPhotoUrl(id)

    // Nama dengan penanda meninggal
    const displayName = person.death_status
      ? `${person.name} (+)`
      : person.name

    return {
      id,
      data: {
        "first name":   displayName,
        "last name":    "",
        "birthday":     formatBirthDate(person),
        "gender":       person.gender === "L" ? "M" : "F",
        "occupation":   person.occupation  || "",
        "education":    person.education   || "",
        "generation":   person.generation  ? `Gen ${person.generation}` : "",
        "address":      person.address     || "",
        "city":         person.city        || "",
        "phone":        person.phone       || "",
        "email":        person.email_social || "",
        "marga":        person.marga       || "",
        ...(photoUrl && { avatar: photoUrl })
      },
      rels: {
        ...(spouses.length  && { spouses }),
        ...(children.length && { children }),
        ...(parents.length  && { parents })
      }
    }
  })
}
