import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import rawData from './silsilah_clean.json'

/**
 * Bangun struktur hierarki d3 dari silsilah_clean.json
 * Root = Ompu Raja Doli Sirait (person_id: "1")
 * Hanya ikuti garis laki-laki Sirait (penerus_marga) untuk inti,
 * tapi tetap tampilkan anak perempuan sebagai leaf.
 */
function buildHierarchy() {
  const { persons, relationships } = rawData
  const { parent_child } = relationships

  // Map person_id → person
  const personMap = {}
  persons.forEach(p => { personMap[p.person_id] = p })

  // Map parent_id → [child_id, ...]
  const childrenMap = {}
  parent_child.forEach(({ parent_id, child_id }) => {
    if (!childrenMap[parent_id]) childrenMap[parent_id] = []
    if (!childrenMap[parent_id].includes(child_id))
      childrenMap[parent_id].push(child_id)
  })

  // Warna per tipe
  function getColor(person) {
    if (!person) return '#555'
    const isL = person.gender === 'L'
    const isInti = person.status_garis === 'Inti Sirait'
    const isPenerus = person.penerus_marga
    if (isInti && isPenerus && isL)  return '#2563eb' // biru — laki Sirait penerus
    if (isInti && !isL)              return '#be185d' // rose — boru Sirait
    if (!isInti && isL)              return '#0e7490' // teal — keturunan laki cabang
    if (!isInti && !isL)             return '#c2410c' // oranye — keturunan perempuan cabang
    return '#4b5563'
  }

  // Rekursif bangun node, hindari siklus
  function buildNode(personId, visited = new Set()) {
    if (visited.has(personId)) return null
    visited.add(personId)

    const person = personMap[personId]
    if (!person) return null

    const childIds = childrenMap[personId] || []

    // Urutkan: laki dulu, baru perempuan, lalu by generation_code
    const sortedChildren = childIds
      .map(id => personMap[id])
      .filter(Boolean)
      .sort((a, b) => {
        const gA = a.gender === 'L' ? 0 : 1
        const gB = b.gender === 'L' ? 0 : 1
        if (gA !== gB) return gA - gB
        const codeA = (a.generation_code || '').split('.').map(Number)
        const codeB = (b.generation_code || '').split('.').map(Number)
        for (let i = 0; i < Math.max(codeA.length, codeB.length); i++) {
          const diff = (codeA[i] || 0) - (codeB[i] || 0)
          if (diff !== 0) return diff
        }
        return 0
      })

    const node = {
      id:       personId,
      name:     person.name,
      gender:   person.gender,
      gen:      parseInt(person.generation) || 0,
      color:    getColor(person),
      isInti:   person.status_garis === 'Inti Sirait',
      isPenerus: person.penerus_marga,
      person,
    }

    const childNodes = sortedChildren
      .map(c => buildNode(c.person_id, new Set(visited)))
      .filter(Boolean)

    if (childNodes.length > 0) {
      node.children = childNodes
    } else {
      node.value = 1
    }

    return node
  }

  return buildNode('1')
}

export default function SunburstChart() {
  const svgRef    = useRef(null)
  const [tooltip, setTooltip] = useState(null) // { x, y, person }
  const [info,    setInfo]    = useState(null)  // person yang di-klik

  useEffect(() => {
    const container = svgRef.current
    if (!container) return

    const W = container.clientWidth  || 800
    const H = container.clientHeight || 800
    const radius = Math.min(W, H) / 2 - 10

    d3.select(container).selectAll('*').remove()

    const svg = d3.select(container)
      .append('svg')
      .attr('width', W)
      .attr('height', H)

    const g = svg.append('g')
      .attr('transform', `translate(${W / 2},${H / 2})`)

    // Hierarchy + partition
    const hierarchyData = buildHierarchy()
    const root = d3.hierarchy(hierarchyData)
      .sum(d => d.value || 0)
      .sort((a, b) => {
        // Laki dulu
        const gA = a.data.gender === 'L' ? 0 : 1
        const gB = b.data.gender === 'L' ? 0 : 1
        return gA - gB
      })

    const partition = d3.partition().size([2 * Math.PI, radius])
    partition(root)

    // Arc generator
    const arc = d3.arc()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .innerRadius(d => d.y0)
      .outerRadius(d => d.y1 - 2)
      .padAngle(0.008)
      .padRadius(radius / 2)
      .cornerRadius(2)

    // Gambar arc
    const path = g.selectAll('path')
      .data(root.descendants().filter(d => d.depth > 0))
      .join('path')
      .attr('d', arc)
      .attr('fill', d => d.data.color)
      .attr('fill-opacity', d => {
        // Lebih transparan untuk generasi jauh
        const base = d.data.isInti ? 0.9 : 0.7
        return base - d.depth * 0.03
      })
      .attr('stroke', '#111')
      .attr('stroke-width', 0.5)
      .style('cursor', 'pointer')

    // Label di arc (hanya jika arc cukup lebar)
    g.selectAll('text')
      .data(root.descendants().filter(d => {
        if (d.depth === 0) return false
        const angle = (d.x1 - d.x0) * (d.y0 + d.y1) / 2
        return angle > 20 // cukup besar untuk label
      }))
      .join('text')
      .attr('transform', d => {
        const angle = (d.x0 + d.x1) / 2
        const r = (d.y0 + d.y1) / 2
        const rotate = angle * 180 / Math.PI - 90
        return `rotate(${rotate}) translate(${r},0) rotate(${rotate > 90 && rotate < 270 ? 180 : 0})`
      })
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', d => Math.max(7, 11 - d.depth))
      .attr('pointer-events', 'none')
      .text(d => {
        // Ambil nama pendek
        const name = d.data.name || ''
        const arcLen = (d.x1 - d.x0) * (d.y0 + d.y1) / 2
        if (arcLen < 30) return ''
        if (arcLen < 60) return name.split(' ')[0]
        return name.length > 18 ? name.slice(0, 16) + '…' : name
      })

    // Label center
    const centerLabel = g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.2em')
      .attr('fill', '#fff')
      .attr('font-size', 13)
      .attr('font-weight', 'bold')
      .text('Ompu Raja')

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.2em')
      .attr('fill', '#aaa')
      .attr('font-size', 11)
      .text('Doli Sirait')

    // Hover tooltip
    path
      .on('mousemove', (event, d) => {
        const [mx, my] = d3.pointer(event, container)
        setTooltip({
          x: mx + 12,
          y: my - 10,
          person: d.data.person,
          name: d.data.name,
          gen: d.data.gen,
          depth: d.depth,
        })
        d3.select(event.currentTarget)
          .attr('fill-opacity', 1)
          .attr('stroke', '#fff')
          .attr('stroke-width', 1.5)
      })
      .on('mouseleave', (event, d) => {
        setTooltip(null)
        d3.select(event.currentTarget)
          .attr('fill-opacity', d.data.isInti ? 0.9 : 0.7)
          .attr('stroke', '#111')
          .attr('stroke-width', 0.5)
      })
      .on('click', (event, d) => {
        setInfo(d.data.person)
      })

  }, [])

  const { persons } = rawData
  const totalGen = Math.max(...persons.map(p => parseInt(p.generation) || 0))

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex' }}>

      {/* Chart area */}
      <div
        ref={svgRef}
        style={{ flex: 1, height: '100%' }}
      />

      {/* Panel info klik */}
      {info && (
        <div style={{
          width: 280, flexShrink: 0, height: '100%', overflowY: 'auto',
          background: 'rgb(20,20,20)', borderLeft: '1px solid #333',
          padding: '20px 16px', color: '#fff',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Detail</span>
            <button onClick={() => setInfo(null)}
              style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>
          <InfoRow label="Nama"       value={info.name} big />
          <InfoRow label="Generasi"   value={info.generation ? `Gen ${info.generation}` : '-'} />
          <InfoRow label="Jenis Kelamin" value={info.gender === 'L' ? 'Laki-laki' : 'Perempuan'} />
          <InfoRow label="Marga"      value={info.marga || '-'} />
          <InfoRow label="Tgl Lahir"  value={info.birth_date || (info.birth_year ? String(info.birth_year) : '-')} />
          <InfoRow label="Status"     value={info.death_status ? 'Meninggal' : 'Hidup'} />
          <InfoRow label="Pendidikan" value={info.education || '-'} />
          <InfoRow label="Pekerjaan"  value={info.occupation || '-'} />
          <InfoRow label="Kota"       value={info.city || '-'} />
          <InfoRow label="Garis"      value={info.status_garis || '-'} />
        </div>
      )}

      {/* Tooltip hover */}
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x, top: tooltip.y,
          background: 'rgba(0,0,0,0.85)', border: '1px solid #444',
          borderRadius: 6, padding: '8px 12px', pointerEvents: 'none',
          color: '#fff', fontSize: 12, maxWidth: 220, zIndex: 200,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{tooltip.name}</div>
          {tooltip.person && (
            <>
              <div style={{ color: '#aaa' }}>Gen {tooltip.gen} · {tooltip.person.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</div>
              {tooltip.person.marga && <div style={{ color: '#aaa' }}>Marga: {tooltip.person.marga}</div>}
              {tooltip.person.city && <div style={{ color: '#aaa' }}>{tooltip.person.city}</div>}
            </>
          )}
        </div>
      )}

      {/* Legenda */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        background: 'rgba(0,0,0,0.7)', borderRadius: 8,
        padding: '10px 14px', fontSize: 11, color: '#ccc',
        display: 'flex', flexDirection: 'column', gap: 5,
        border: '1px solid #333',
      }}>
        {[
          { color: '#2563eb', label: 'Laki-laki Sirait (penerus marga)' },
          { color: '#be185d', label: 'Perempuan Sirait (boru)' },
          { color: '#0e7490', label: 'Keturunan laki dari boru (cabang)' },
          { color: '#c2410c', label: 'Keturunan perempuan dari boru (cabang)' },
        ].map(item => (
          <div key={item.color} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color, flexShrink: 0 }} />
            <span>{item.label}</span>
          </div>
        ))}
        <div style={{ marginTop: 4, color: '#666', fontSize: 10 }}>
          Cincin = generasi · Lebar = jumlah keturunan · Klik untuk detail
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, big }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: big ? 15 : 13, color: '#fff', fontWeight: big ? 600 : 400, marginTop: 2 }}>{value}</div>
    </div>
  )
}
