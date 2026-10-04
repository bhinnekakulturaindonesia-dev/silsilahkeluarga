import rawData from './silsilah_clean.json'

// Ambil semua foto di src/assets/photos otomatis saat build.
const photoModules = import.meta.glob(
  '/src/assets/photos/*.{jpg,jpeg,png,JPG,JPEG,PNG}',
  { eager: true, import: 'default' }
)

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
 * Urutan sorting anak:
 * 1. Laki-laki (L) didahulukan → perempuan (P) belakangan  [prioritas Batak]
 * 2. Dalam kelompok yang sama, urutkan by Anak_Ke (angka terakhir generation_code)
 */
function getChildSortKey(person) {
  const genderOrder = person.gender === 'L' ? 0 : 1
  const parts = (person.generation_code || '').split('.')
  const childOrder = parseInt(parts[parts.length - 1]) || 999
  return [genderOrder, childOrder]
}

function compareChildOrder(a, b) {
  const [ga, oa] = getChildSortKey(a)
  const [gb, ob] = getChildSortKey(b)
  if (ga !== gb) return ga - gb
  return oa - ob
}

/**
 * Format tanggal lahir: "1976-10-21" → "21 Okt 1976"
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

/**
 * Tentukan tipe kartu untuk pewarnaan:
 *
 * 'sirait-male'    → Laki-laki Sirait (penerus marga, garis inti)
 * 'sirait-female'  → Perempuan Sirait (boru, garis inti tapi tidak penerus)
 * 'spouse-male'    → Suami dari boru Sirait (laki-laki luar marga)
 * 'spouse-female'  → Istri dari laki-laki Sirait (perempuan luar marga)
 * 'branch-male'    → Keturunan laki-laki dari boru Sirait (cabang)
 * 'branch-female'  → Keturunan perempuan dari boru Sirait (cabang)
 */
export function getCardType(person) {
  const isLaki  = person.gender === 'L'
  const isInti  = person.status_garis === 'Inti Sirait'
  const isPenerus = person.penerus_marga === true

  if (isInti && isPenerus && isLaki)  return 'sirait-male'    // laki Sirait penerus marga
  if (isInti && !isPenerus && !isLaki) return 'sirait-female' // boru Sirait
  if (isInti && !isPenerus && isLaki)  return 'sirait-male'   // laki Sirait (non-penerus edge case)
  if (!isInti && isLaki)  return person.role === 'Pasangan' ? 'spouse-male'   : 'branch-male'
  if (!isInti && !isLaki) return person.role === 'Pasangan' ? 'spouse-female' : 'branch-female'
  return 'sirait-male'
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

    // Cari anak → L didahulukan, baru P
    const childIds = [...new Set(
      parent_child
        .filter(r => r.parent_id === id)
        .map(r => r.child_id)
    )]

    const children = childIds
      .map(childId => persons.find(p => p.person_id === childId))
      .filter(Boolean)
      .sort(compareChildOrder)
      .map(p => p.person_id)

    // Cari orang tua
    const parents = parent_child
      .filter(r => r.child_id === id)
      .map(r => r.parent_id)

    const photoUrl = getPhotoUrl(id)
    const cardType = getCardType(person)

    const displayName = person.death_status
      ? `${person.name} (+)`
      : person.name

    return {
      id,
      data: {
        "first name":   displayName,
        "last name":    "",
        "birthday":     formatBirthDate(person),
        "gender":       person.gender === 'L' ? 'M' : 'F',
        "occupation":   person.occupation   || '',
        "education":    person.education    || '',
        "generation":   person.generation   ? `Gen ${person.generation}` : '',
        "address":      person.address      || '',
        "city":         person.city         || '',
        "phone":        person.phone        || '',
        "email":        person.email_social || '',
        "marga":        person.marga        || '',
        // Simpan tipe kartu di data agar bisa diakses saat render
        "card_type":    cardType,
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
