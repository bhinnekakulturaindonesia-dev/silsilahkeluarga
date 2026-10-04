import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import rawData from './silsilah_clean.json'

function buildHierarchy() {
  const { persons, relationships } = rawData
  const { parent_child, spouse } = relationships

  const personMap = {}
  persons.forEach(p => { personMap[p.person_id] = p })

  // parent_id → [child_id]
  const childrenMap = {}
  parent_child.forEach(({ parent_id, child_id }) => {
    if (!childrenMap[parent_id]) childrenMap[parent_id] = []
    if (!childrenMap[parent_id].includes(child_id))
      childrenMap[parent_id].push(child_id)
  })

  // person_id → [spouse_id]
  const spouseMap = {}
  spouse.forEach(({ husband_id, wife_id }) => {
    if (!spouseMap[husband_id]) spouseMap[husband_id] = []
    if (!spouseMap[wife_id])    spouseMap[wife_id]    = []
    if (!spouseMap[husband_id].includes(wife_id)) spouseMap[husband_id].push(wife_id)
    if (!spouseMap[wife_id].includes(husband_id)) spouseMap[wife_id].push(husband_id)
  })

  function getColor(person, isSpouse = false) {
    if (!person) return '#555'
    const isL      = person.gender === 'L'
    const isInti   = person.status_garis === 'Inti Sirait'
    const isPenerus = person.penerus_marga
    // Pasangan — warna lebih redup/berbeda
    if (isSpouse) {
      if (isL)  return '#1a3d2e'  // hijau tua — suami dari boru
      return '#3a1f5c'             // ungu — istri dari laki Sirait
    }
    if (isInti && isPenerus && isL) return '#2563eb'  // biru
    if (isInti && !isL)             return '#be185d'  // rose
    if (!isInti && isL)             return '#0e7490'  // teal
    if (!isInti && !isL)            return '#c2410c'  // oranye
    return '#4b5563'
  }

  function buildNode(personId, visited = new Set()) {
    if (visited.has(personId)) return null
    visited.add(personId)

    const person = personMap[personId]
    if (!person) return null

    const childIds  = childrenMap[personId] || []
    const spouseIds = spouseMap[personId]   || []

    // Urutkan anak: laki dulu, lalu by generation_code
    const sortedChildren = childIds
      .map(id => personMap[id])
      .filter(Boolean)
      .sort((a, b) => {
        const gA = a.gender === 'L' ? 0 : 1
        const gB = b.gender === 'L' ? 0 : 1
        if (gA !== gB) return gA - gB
        const cA = (a.generation_code || '').split('.').map(Number)
        const cB = (b.generation_code || '').split('.').map(Number)
        for (let i = 0; i < Math.max(cA.length, cB.length); i++) {
          const diff = (cA[i] || 0) - (cB[i] || 0)
          if (diff !== 0) return diff
        }
        return 0
      })

    const node = {
      id:        personId,
      name:      person.name,
      gender:    person.gender,
      gen:       parseInt(person.generation) || 0,
      color:     getColor(person, false),
      isInti:    person.status_garis === 'Inti Sirait',
      isPenerus: person.penerus_marga,
      isSpouse:  false,
      person,
    }

    const childNodes = sortedChildren
      .map(c => buildNode(c.person_id, new Set(visited)))
      .filter(Boolean)

    // Pasangan sebagai leaf node khusus — ditambahkan SETELAH anak-anak
    const spouseNodes = spouseIds
      .filter(sid => !visited.has(sid))
      .map(sid => {
        const sp = personMap[sid]
        if (!sp) return null
        return {
          id:        sid + '_spouse',
          name:      sp.name,
          gender:    sp.gender,
          gen:       parseInt(sp.generation) || node.gen,
          color:     getColor(sp, true),
          isInti:    false,
          isPenerus: false,
          isSpouse:  true,
          person:    sp,
          value:     0.6,  // lebih kecil dari anak (value=1), tapi tetap kelihatan
        }
      })
      .filter(Boolean)

    const allChildren = [...childNodes, ...spouseNodes]

    if (allChildren.length > 0) {
      node.children = allChildren
    } else {
      node.value = 1
    }

    return node
  }

  return buildNode('1')
}

export default function SunburstChart() {
  const svgRef  = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [info,    setInfo]    = useState(null)

  useEffect(() => {
    const container = svgRef.current
    if (!container) return

    const W      = container.clientWidth  || 800
    const H      = container.clientHeight || 800
    const radius = Math.min(W, H) / 2 - 4

    d3.select(container).selectAll('*').remove()

    const svg = d3.select(container)
      .append('svg')
      .attr('width', W)
      .attr('height', H)

    const g = svg.append('g')
      .attr('transform', `translate(${W / 2},${H / 2})`)

    const hierarchyData = buildHierarchy()
    const root = d3.hierarchy(hierarchyData)
      .sum(d => d.value || 0)

    const partition = d3.partition().size([2 * Math.PI, radius])
    partition(root)

    // Arc generator
    const arc = d3.arc()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .innerRadius(d => d.y0)
      .outerRadius(d => d.y1 - 2)
      .padAngle(0.006)
      .padRadius(radius / 2)
      .cornerRadius(2)

    // Gambar arc
    const path = g.selectAll('path')
      .data(root.descendants().filter(d => d.depth > 0))
      .join('path')
      .attr('d', arc)
      .attr('fill', d => d.data.color)
      .attr('fill-opacity', d => {
        if (d.data.isSpouse) return 0.75
        return d.data.isInti ? 0.88 : 0.70
      })
      .attr('stroke', d => d.data.isSpouse ? '#888' : '#111')
      .attr('stroke-width', d => d.data.isSpouse ? 0.8 : 0.5)
      .attr('stroke-dasharray', d => d.data.isSpouse ? '2,2' : 'none')
      .style('cursor', 'pointer')

    // Label — semua node, adaptif
    root.descendants().filter(d => d.depth > 0).forEach(d => {
      const midAngle  = (d.x0 + d.x1) / 2
      const midRadius = (d.y0 + d.y1) / 2
      const arcLength = (d.x1 - d.x0) * midRadius
      const fontSize  = Math.min(11, Math.max(6, arcLength / 11))
      const charWidth = fontSize * 0.55
      const maxChars  = Math.floor(arcLength / charWidth)

      if (maxChars < 2) return

      const fullName = (d.data.name || '').replace(' (+)', '')
      const parts    = fullName.split(' ')
      let label = fullName
      if (label.length > maxChars) label = parts[0]
      if (label.length > maxChars) label = label.slice(0, maxChars - 1) + '…'

      const rotateDeg = midAngle * 180 / Math.PI - 90
      const flip      = rotateDeg > 90 && rotateDeg < 270

      g.append('text')
        .attr('transform',
          `rotate(${rotateDeg}) translate(${midRadius},0) rotate(${flip ? 180 : 0})`)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('fill', d.data.isSpouse ? '#ddd' : '#fff')
        .attr('font-size', fontSize)
        .attr('font-style', d.data.isSpouse ? 'italic' : 'normal')
        .attr('pointer-events', 'none')
        .attr('opacity', 0.92)
        .text(label)
    })

    // Label center
    g.append('text').attr('text-anchor','middle').attr('dy','-0.2em')
      .attr('fill','#fff').attr('font-size',13).attr('font-weight','bold')
      .text('Ompu Raja')
    g.append('text').attr('text-anchor','middle').attr('dy','1.2em')
      .attr('fill','#aaa').attr('font-size',11).text('Doli Sirait')

    // Hover + klik
    path
      .on('mousemove', (event, d) => {
        const [mx, my] = d3.pointer(event, container)
        setTooltip({ x: mx + 12, y: my - 10, d })
        d3.select(event.currentTarget).attr('fill-opacity', 1).attr('stroke','#fff').attr('stroke-width', 1.5)
      })
      .on('mouseleave', (event, d) => {
        setTooltip(null)
        d3.select(event.currentTarget)
          .attr('fill-opacity', d.data.isSpouse ? 0.75 : d.data.isInti ? 0.88 : 0.70)
          .attr('stroke', d.data.isSpouse ? '#888' : '#111')
          .attr('stroke-width', d.data.isSpouse ? 0.8 : 0.5)
      })
      .on('click', (event, d) => setInfo(d.data.person))

  }, [])

  return (
    <div style={{ width:'100%', height:'100%', position:'relative', display:'flex' }}>

      {/* Chart */}
      <div ref={svgRef} style={{ flex:1, height:'100%' }} />

      {/* Panel detail */}
      {info && (
        <div style={{
          width:280, flexShrink:0, height:'100%', overflowY:'auto',
          background:'rgb(20,20,20)', borderLeft:'1px solid #333',
          padding:'20px 16px', color:'#fff',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <span style={{ fontSize:14, fontWeight:600 }}>Detail</span>
            <button onClick={() => setInfo(null)}
              style={{ background:'none', border:'none', color:'#aaa', fontSize:18, cursor:'pointer' }}>✕</button>
          </div>
          <InfoRow label="Nama"         value={info.name} big />
          <InfoRow label="Generasi"     value={info.generation ? `Gen ${info.generation}` : '-'} />
          <InfoRow label="Jenis Kelamin" value={info.gender === 'L' ? 'Laki-laki' : 'Perempuan'} />
          <InfoRow label="Marga"        value={info.marga || '-'} />
          <InfoRow label="Tgl Lahir"    value={info.birth_date || (info.birth_year ? String(info.birth_year) : '-')} />
          <InfoRow label="Status"       value={info.death_status ? 'Meninggal' : 'Hidup'} />
          <InfoRow label="Pendidikan"   value={info.education || '-'} />
          <InfoRow label="Pekerjaan"    value={info.occupation || '-'} />
          <InfoRow label="Kota"         value={info.city || '-'} />
          <InfoRow label="Garis"        value={info.status_garis || '-'} />
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position:'absolute', left:tooltip.x, top:tooltip.y, zIndex:200,
          background:'rgba(0,0,0,0.88)', border:'1px solid #444',
          borderRadius:6, padding:'8px 12px', pointerEvents:'none',
          color:'#fff', fontSize:12, maxWidth:240,
        }}>
          <div style={{ fontWeight:600, marginBottom:3 }}>
            {tooltip.d.data.isSpouse ? '👫 ' : ''}{tooltip.d.data.name}
          </div>
          <div style={{ color:'#aaa' }}>
            Gen {tooltip.d.data.gen} · {tooltip.d.data.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
            {tooltip.d.data.isSpouse ? ' · Pasangan' : ''}
          </div>
          {tooltip.d.data.person?.marga && <div style={{ color:'#aaa' }}>Marga: {tooltip.d.data.person.marga}</div>}
          {tooltip.d.data.person?.city  && <div style={{ color:'#aaa' }}>{tooltip.d.data.person.city}</div>}
        </div>
      )}

      {/* Legenda */}
      <div style={{
        position:'absolute', bottom:16, left:16,
        background:'rgba(0,0,0,0.75)', borderRadius:8, border:'1px solid #333',
        padding:'10px 14px', fontSize:11, color:'#ccc',
        display:'flex', flexDirection:'column', gap:5,
      }}>
        {[
          { color:'#2563eb', label:'Laki-laki Sirait (penerus marga)' },
          { color:'#be185d', label:'Perempuan Sirait (boru)' },
          { color:'#0e7490', label:'Keturunan laki dari boru (cabang)' },
          { color:'#c2410c', label:'Keturunan perempuan dari boru (cabang)' },
          { color:'#3a1f5c', border:'#888', label:'Istri dari laki-laki Sirait', italic:true },
          { color:'#1a3d2e', border:'#888', label:'Suami dari boru Sirait', italic:true },
        ].map(item => (
          <div key={item.color} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{
              width:12, height:12, borderRadius:3, background:item.color, flexShrink:0,
              border: item.border ? `1.5px dashed ${item.border}` : 'none',
            }} />
            <span style={{ fontStyle: item.italic ? 'italic' : 'normal' }}>{item.label}</span>
          </div>
        ))}
        <div style={{ marginTop:4, color:'#666', fontSize:10 }}>
          Cincin = generasi · Lebar = keturunan · Klik untuk detail
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, big }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ fontSize:10, color:'#666', textTransform:'uppercase', letterSpacing:0.5 }}>{label}</div>
      <div style={{ fontSize: big ? 15 : 13, color:'#fff', fontWeight: big ? 600 : 400, marginTop:2 }}>{value}</div>
    </div>
  )
}
