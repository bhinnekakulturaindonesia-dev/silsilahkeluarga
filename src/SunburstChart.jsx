import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import rawData from './silsilah_clean.json'

// ── Warna ──────────────────────────────────────────────────────────────────
function getColor(person) {
  if (!person) return '#555'
  const isL      = person.gender === 'L'
  const isInti   = person.status_garis === 'Inti Sirait'
  const isPenerus = person.penerus_marga
  if (isInti && isPenerus && isL) return '#2563eb'  // biru  — laki Sirait penerus
  if (isInti && !isL)             return '#be185d'  // rose  — boru Sirait
  if (!isInti && isL)             return '#0e7490'  // teal  — laki cabang
  if (!isInti && !isL)            return '#c2410c'  // oranye— perempuan cabang
  return '#4b5563'
}
function getSpouseColor(person) {
  if (!person) return '#555'
  return person.gender === 'L' ? '#1a3d2e' : '#3a1f5c'
}

// ── Bangun hierarki TANPA pasangan ─────────────────────────────────────────
function buildHierarchy() {
  const { persons, relationships } = rawData
  const { parent_child } = relationships

  const personMap = {}
  persons.forEach(p => { personMap[p.person_id] = p })

  const childrenMap = {}
  parent_child.forEach(({ parent_id, child_id }) => {
    if (!childrenMap[parent_id]) childrenMap[parent_id] = []
    if (!childrenMap[parent_id].includes(child_id))
      childrenMap[parent_id].push(child_id)
  })

  function buildNode(id, visited = new Set()) {
    if (visited.has(id)) return null
    visited.add(id)
    const p = personMap[id]
    if (!p) return null

    const kids = (childrenMap[id] || [])
      .map(cid => personMap[cid]).filter(Boolean)
      .sort((a, b) => {
        const gA = a.gender === 'L' ? 0 : 1
        const gB = b.gender === 'L' ? 0 : 1
        if (gA !== gB) return gA - gB
        const cA = (a.generation_code || '').split('.').map(Number)
        const cB = (b.generation_code || '').split('.').map(Number)
        for (let i = 0; i < Math.max(cA.length, cB.length); i++) {
          const d = (cA[i] || 0) - (cB[i] || 0)
          if (d !== 0) return d
        }
        return 0
      })

    const node = {
      id, name: p.name, gender: p.gender,
      gen: parseInt(p.generation) || 0,
      color: getColor(p),
      isInti: p.status_garis === 'Inti Sirait',
      person: p,
    }

    const childNodes = kids.map(c => buildNode(c.person_id, new Set(visited))).filter(Boolean)
    if (childNodes.length > 0) node.children = childNodes
    else node.value = 1
    return node
  }

  return buildNode('1')
}

// ── Bangun map pasangan: person_id → [spouse person] ──────────────────────
function buildSpouseMap() {
  const { persons, relationships } = rawData
  const { spouse } = relationships
  const personMap = {}
  persons.forEach(p => { personMap[p.person_id] = p })

  const map = {}  // person_id → [spouse person]

  spouse.forEach(({ husband_id, wife_id }) => {
    const h = personMap[husband_id]
    const w = personMap[wife_id]
    if (!h || !w) return

    const hInti = h.status_garis === 'Inti Sirait'
    const wInti = w.status_garis === 'Inti Sirait'

    // Tampilkan pasangan di sisi yang lebih "inti" agar tidak duplikat
    let anchor, target
    if (hInti) { anchor = husband_id; target = w }
    else if (wInti) { anchor = wife_id; target = h }
    else { anchor = husband_id; target = w }  // cabang-cabang: di sisi suami

    if (!map[anchor]) map[anchor] = []
    map[anchor].push(target)
  })

  return map
}

// ── Komponen utama ─────────────────────────────────────────────────────────
export default function SunburstChart() {
  const containerRef = useRef(null)
  const svgRef       = useRef(null)
  const zoomRef      = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [info,    setInfo]    = useState(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const W      = container.clientWidth  || 800
    const H      = container.clientHeight || 800
    const cx     = W / 2
    const cy     = H / 2
    // Radius lebih kecil agar ada ruang untuk label pasangan di luar
    const radius = Math.min(W, H) / 2 - 20

    d3.select(container).selectAll('*').remove()

    const svg = d3.select(container)
      .append('svg')
      .attr('width', W)
      .attr('height', H)
      .style('cursor', 'grab')

    // Zoom layer
    const zoomG = svg.append('g').attr('transform', `translate(${cx},${cy})`)

    // Setup d3-zoom
    const zoom = d3.zoom()
      .scaleExtent([0.3, 8])
      .on('zoom', (e) => {
        zoomG.attr('transform',
          `translate(${cx + e.transform.x},${cy + e.transform.y}) scale(${e.transform.k})`)
      })
    svg.call(zoom)
    svg.on('dblclick.zoom', null) // disable dblclick zoom default
    zoomRef.current = zoom

    // Scroll zoom hanya dengan Ctrl
    svg.on('wheel.zoom', (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoom.scaleBy(svg.transition().duration(200), e.deltaY < 0 ? 1.2 : 1 / 1.2)
    }, { passive: false })

    // ── Data ──
    const hierData  = buildHierarchy()
    const spouseMap = buildSpouseMap()

    const root = d3.hierarchy(hierData).sum(d => d.value || 0)
    const partition = d3.partition().size([2 * Math.PI, radius])
    partition(root)

    // Map person_id → d3 node (untuk cari posisi arc saat render pasangan)
    const nodeById = {}
    root.descendants().forEach(d => { nodeById[d.data.id] = d })

    // Arc generator
    const arc = d3.arc()
      .startAngle(d => d.x0).endAngle(d => d.x1)
      .innerRadius(d => d.y0).outerRadius(d => d.y1 - 2)
      .padAngle(0.006).padRadius(radius / 2).cornerRadius(2)

    // ── Gambar arc utama ──
    const path = zoomG.selectAll('path.main')
      .data(root.descendants().filter(d => d.depth > 0))
      .join('path').attr('class','main')
      .attr('d', arc)
      .attr('fill', d => d.data.color)
      .attr('fill-opacity', d => d.data.isInti ? 0.88 : 0.72)
      .attr('stroke', '#111').attr('stroke-width', 0.5)
      .style('cursor', 'pointer')

    // ── Gambar arc pasangan (overlay di radius yang sama) ──
    // Pasangan ditampilkan sebagai arc kecil di sisi kanan arc utama
    const SPOUSE_FRAC = 0.28  // ambil 28% dari lebar arc sebagai arc pasangan

    const spouseArcs = []
    root.descendants().filter(d => d.depth > 0).forEach(d => {
      const spouses = spouseMap[d.data.id]
      if (!spouses || spouses.length === 0) return

      const arcSpan   = d.x1 - d.x0
      const spouseSpan = arcSpan * SPOUSE_FRAC
      const mainSpan   = arcSpan - spouseSpan - 0.004

      // Tambahkan data arc pasangan
      spouses.forEach((sp, i) => {
        spouseArcs.push({
          x0: d.x1 - spouseSpan + i * (spouseSpan / spouses.length),
          x1: d.x1 - i * (spouseSpan / spouses.length),
          y0: d.y0,
          y1: d.y1,
          person: sp,
          anchorId: d.data.id,
        })
      })

      // Kecilkan arc utama agar ada ruang
      d._x1_orig = d.x1
      d.x1 = d.x0 + mainSpan
    })

    // Re-render arc utama dengan x1 yang sudah dikecilkan
    path.attr('d', arc)

    // Arc pasangan
    const spouseArcGen = d3.arc()
      .startAngle(d => d.x0).endAngle(d => d.x1)
      .innerRadius(d => d.y0).outerRadius(d => d.y1 - 2)
      .padAngle(0.004).padRadius(radius / 2).cornerRadius(2)

    zoomG.selectAll('path.spouse')
      .data(spouseArcs)
      .join('path').attr('class','spouse')
      .attr('d', spouseArcGen)
      .attr('fill', d => getSpouseColor(d.person))
      .attr('fill-opacity', 0.78)
      .attr('stroke', '#888').attr('stroke-width', 0.8)
      .attr('stroke-dasharray', '2,2')
      .style('cursor', 'pointer')
      .on('mousemove', (event, d) => {
        const [mx, my] = d3.pointer(event, container)
        setTooltip({ x: mx + 12, y: my - 10, person: d.person, isSpouse: true })
        d3.select(event.currentTarget).attr('fill-opacity', 1).attr('stroke','#fff').attr('stroke-width',1.5)
      })
      .on('mouseleave', (event) => {
        setTooltip(null)
        d3.select(event.currentTarget).attr('fill-opacity', 0.78).attr('stroke','#888').attr('stroke-width',0.8)
      })
      .on('click', (event, d) => setInfo(d.person))

    // ── Label ──
    function drawLabels(nodes, isSpouseArr = false) {
      nodes.forEach(d => {
        const x0 = d.x0, x1 = isSpouseArr ? d.x1 : (d._x1_orig ? d.x0 + (d._x1_orig - d.x0) * 0.72 : d.x1)
        const midAngle  = (x0 + (isSpouseArr ? d.x1 : x1)) / 2
        const midRadius = ((isSpouseArr ? d.y0 : d.y0) + (isSpouseArr ? d.y1 : d.y1)) / 2
        const arcLength = (isSpouseArr ? (d.x1 - d.x0) : (x1 - d.x0)) * midRadius
        const fontSize  = Math.min(11, Math.max(6, arcLength / 11))
        const maxChars  = Math.floor(arcLength / (fontSize * 0.55))
        if (maxChars < 2) return

        const person   = isSpouseArr ? d.person : d.data?.person
        const fullName = (person?.name || d.data?.name || '').replace(' (+)', '')
        const parts    = fullName.split(' ')
        let label = fullName
        if (label.length > maxChars) label = parts[0]
        if (label.length > maxChars) label = label.slice(0, maxChars - 1) + '…'

        const rotateDeg = midAngle * 180 / Math.PI - 90
        const flip      = rotateDeg > 90 && rotateDeg < 270

        zoomG.append('text')
          .attr('transform',
            `rotate(${rotateDeg}) translate(${midRadius},0) rotate(${flip ? 180 : 0})`)
          .attr('dy', '0.35em')
          .attr('text-anchor', 'middle')
          .attr('fill', isSpouseArr ? '#ddd' : '#fff')
          .attr('font-size', fontSize)
          .attr('font-style', isSpouseArr ? 'italic' : 'normal')
          .attr('pointer-events', 'none')
          .attr('opacity', 0.92)
          .text(label)
      })
    }

    const mainNodes = root.descendants().filter(d => d.depth > 0)
    drawLabels(mainNodes, false)
    drawLabels(spouseArcs, true)

    // Label center
    zoomG.append('text').attr('text-anchor','middle').attr('dy','-0.3em')
      .attr('fill','#fff').attr('font-size',13).attr('font-weight','bold').text('Ompu Raja')
    zoomG.append('text').attr('text-anchor','middle').attr('dy','1em')
      .attr('fill','#aaa').attr('font-size',11).text('Doli Sirait')

    // Hover & klik arc utama
    path
      .on('mousemove', (event, d) => {
        const [mx, my] = d3.pointer(event, container)
        setTooltip({ x: mx + 12, y: my - 10, person: d.data.person, isSpouse: false })
        d3.select(event.currentTarget).attr('fill-opacity',1).attr('stroke','#fff').attr('stroke-width',1.5)
      })
      .on('mouseleave', (event, d) => {
        setTooltip(null)
        d3.select(event.currentTarget)
          .attr('fill-opacity', d.data.isInti ? 0.88 : 0.72)
          .attr('stroke','#111').attr('stroke-width',0.5)
      })
      .on('click', (event, d) => setInfo(d.data.person))

    svgRef.current = svg

  }, [])

  const handleZoomIn  = () => { if (svgRef.current && zoomRef.current) svgRef.current.transition().duration(300).call(zoomRef.current.scaleBy, 1.4) }
  const handleZoomOut = () => { if (svgRef.current && zoomRef.current) svgRef.current.transition().duration(300).call(zoomRef.current.scaleBy, 1 / 1.4) }
  const handleReset   = () => { if (svgRef.current && zoomRef.current) svgRef.current.transition().duration(400).call(zoomRef.current.transform, d3.zoomIdentity) }

  const btnBase = {
    background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.25)',
    color:'#fff', width:36, height:36, borderRadius:6, cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center', fontSize:18,
  }

  return (
    <div style={{ width:'100%', height:'100%', position:'relative', display:'flex' }}>

      {/* Chart */}
      <div ref={containerRef} style={{ flex:1, height:'100%' }} />

      {/* Zoom controls */}
      <div style={{ position:'absolute', bottom:24, right: info ? 304 : 24, zIndex:100, display:'flex', flexDirection:'column', gap:8 }}>
        <button title="Zoom In"  onClick={handleZoomIn}  style={btnBase}>＋</button>
        <button title="Zoom Out" onClick={handleZoomOut} style={btnBase}>－</button>
        <button title="Reset"    onClick={handleReset}   style={{...btnBase, fontSize:14}}>⊡</button>
      </div>

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
          <InfoRow label="Nama"          value={info.name} big />
          <InfoRow label="Generasi"      value={info.generation ? `Gen ${info.generation}` : '-'} />
          <InfoRow label="Jenis Kelamin" value={info.gender === 'L' ? 'Laki-laki' : 'Perempuan'} />
          <InfoRow label="Marga"         value={info.marga || '-'} />
          <InfoRow label="Tgl Lahir"     value={info.birth_date || (info.birth_year ? String(info.birth_year) : '-')} />
          <InfoRow label="Status"        value={info.death_status ? 'Meninggal' : 'Hidup'} />
          <InfoRow label="Pendidikan"    value={info.education || '-'} />
          <InfoRow label="Pekerjaan"     value={info.occupation || '-'} />
          <InfoRow label="Kota"          value={info.city || '-'} />
          <InfoRow label="Garis"         value={info.status_garis || '-'} />
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position:'absolute', left:tooltip.x, top:tooltip.y, zIndex:200,
          background:'rgba(0,0,0,0.88)', border:'1px solid #555',
          borderRadius:6, padding:'8px 12px', pointerEvents:'none',
          color:'#fff', fontSize:12, maxWidth:240,
        }}>
          <div style={{ fontWeight:600, marginBottom:3 }}>
            {tooltip.isSpouse ? '👫 ' : ''}{tooltip.person?.name}
          </div>
          {tooltip.person && <>
            <div style={{ color:'#aaa' }}>
              {tooltip.person.generation ? `Gen ${tooltip.person.generation} · ` : ''}
              {tooltip.person.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
              {tooltip.isSpouse ? ' · Pasangan' : ''}
            </div>
            {tooltip.person.marga && <div style={{ color:'#aaa' }}>Marga: {tooltip.person.marga}</div>}
            {tooltip.person.city  && <div style={{ color:'#aaa' }}>{tooltip.person.city}</div>}
          </>}
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
          { color:'#3a1f5c', dashed:true, label:'Istri dari laki-laki Sirait', italic:true },
          { color:'#1a3d2e', dashed:true, label:'Suami dari boru Sirait', italic:true },
        ].map(item => (
          <div key={item.color} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{
              width:12, height:12, borderRadius:3, background:item.color, flexShrink:0,
              border: item.dashed ? '1.5px dashed #888' : 'none',
            }} />
            <span style={{ fontStyle: item.italic ? 'italic' : 'normal' }}>{item.label}</span>
          </div>
        ))}
        <div style={{ marginTop:4, color:'#555', fontSize:10 }}>
          Scroll+Ctrl = zoom · Drag = pan · Klik = detail
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
