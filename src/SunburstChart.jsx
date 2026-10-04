import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import rawData from './silsilah_clean.json'

// ── Warna ──────────────────────────────────────────────────────────────────
function getColor(person) {
  if (!person) return '#555'
  const isL = person.gender === 'L'
  const isInti = person.status_garis === 'Inti Sirait'
  const isPenerus = person.penerus_marga
  if (isInti && isPenerus && isL) return '#2563eb'
  if (isInti && !isL)             return '#be185d'
  if (!isInti && isL)             return '#0e7490'
  if (!isInti && !isL)            return '#c2410c'
  return '#4b5563'
}
function getSpouseColor(p) {
  if (!p) return '#555'
  return p.gender === 'L' ? '#1a3d2e' : '#3a1f5c'
}

// ── Build hierarchy (tanpa pasangan) ──────────────────────────────────────
function buildHierarchy() {
  const { persons, relationships: { parent_child } } = rawData
  const personMap = Object.fromEntries(persons.map(p => [p.person_id, p]))
  const childrenMap = {}
  parent_child.forEach(({ parent_id, child_id }) => {
    if (!childrenMap[parent_id]) childrenMap[parent_id] = []
    if (!childrenMap[parent_id].includes(child_id)) childrenMap[parent_id].push(child_id)
  })

  function buildNode(id, visited = new Set()) {
    if (visited.has(id)) return null
    visited.add(id)
    const p = personMap[id]
    if (!p) return null
    const kids = (childrenMap[id] || [])
      .map(cid => personMap[cid]).filter(Boolean)
      .sort((a, b) => {
        const gd = (a.gender === 'L' ? 0 : 1) - (b.gender === 'L' ? 0 : 1)
        if (gd !== 0) return gd
        const ca = (a.generation_code || '').split('.').map(Number)
        const cb = (b.generation_code || '').split('.').map(Number)
        for (let i = 0; i < Math.max(ca.length, cb.length); i++) {
          const d = (ca[i] || 0) - (cb[i] || 0)
          if (d !== 0) return d
        }
        return 0
      })
    const node = { id, name: p.name, gender: p.gender, gen: parseInt(p.generation) || 0, color: getColor(p), isInti: p.status_garis === 'Inti Sirait', person: p }
    const childNodes = kids.map(c => buildNode(c.person_id, new Set(visited))).filter(Boolean)
    if (childNodes.length > 0) node.children = childNodes
    else node.value = 1
    return node
  }
  return buildNode('1')
}

// ── Build spouse map ──────────────────────────────────────────────────────
function buildSpouseMap() {
  const { persons, relationships: { spouse } } = rawData
  const personMap = Object.fromEntries(persons.map(p => [p.person_id, p]))
  const map = {}
  spouse.forEach(({ husband_id, wife_id }) => {
    const h = personMap[husband_id], w = personMap[wife_id]
    if (!h || !w) return
    const anchor = h.status_garis === 'Inti Sirait' ? husband_id
      : w.status_garis === 'Inti Sirait' ? wife_id : husband_id
    const target = anchor === husband_id ? w : h
    if (!map[anchor]) map[anchor] = []
    map[anchor].push(target)
  })
  return map
}

// ── Komponen ──────────────────────────────────────────────────────────────
export default function SunburstChart() {
  const containerRef = useRef(null)
  const stateRef     = useRef(null)   // menyimpan semua state D3 agar bisa di-update tanpa re-render
  const [tooltip,  setTooltip]  = useState(null)
  const [info,     setInfo]     = useState(null)
  const [breadcrumb, setBreadcrumb] = useState([]) // trail navigasi

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const W = container.clientWidth  || 800
    const H = container.clientHeight || 800
    const cx = W / 2, cy = H / 2
    const radius = Math.min(W, H) / 2 - 10

    d3.select(container).selectAll('*').remove()

    const svg = d3.select(container)
      .append('svg').attr('width', W).attr('height', H)

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`)

    // ── Hierarki ──
    const hierData  = buildHierarchy()
    const spouseMap = buildSpouseMap()
    const root = d3.hierarchy(hierData).sum(d => d.value || 0)

    // Simpan x0/x1/y0/y1 awal di setiap node
    root.each(d => {
      d.current = { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 }
    })

    const TAU = 2 * Math.PI
    const partition = d3.partition().size([TAU, radius])
    partition(root)
    root.each(d => { d.current = { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 } })

    // ── Arc ──
    const arcGen = d3.arc()
      .startAngle(d => d.x0).endAngle(d => d.x1)
      .innerRadius(d => d.y0).outerRadius(d => d.y1 - 2)
      .padAngle(0.006).padRadius(radius / 2).cornerRadius(2)

    // Arc untuk animasi (pakai .current)
    const arcCurrent = d3.arc()
      .startAngle(d => d.current.x0).endAngle(d => d.current.x1)
      .innerRadius(d => d.current.y0).outerRadius(d => d.current.y1 - 2)
      .padAngle(0.006).padRadius(radius / 2).cornerRadius(2)

    // ── Filter visible ──
    function visible(d, focus) {
      return d.x1 > focus.x0 && d.x0 < focus.x1
    }

    // ── Gambar arc utama ──
    const SPOUSE_FRAC = 0.25

    // Pre-compute: arc utama dikecilkan jika punya pasangan
    root.descendants().filter(d => d.depth > 0).forEach(d => {
      if (spouseMap[d.data.id]?.length) {
        d._x1_full = d.x1
        d.x1 = d.x0 + (d.x1 - d.x0) * (1 - SPOUSE_FRAC) - 0.003
        d.current.x1 = d.x1
      }
    })

    const paths = g.selectAll('path.main')
      .data(root.descendants().filter(d => d.depth > 0))
      .join('path').attr('class', 'main')
      .attr('d', arcCurrent)
      .attr('fill', d => d.data.color)
      .attr('fill-opacity', d => d.data.isInti ? 0.88 : 0.72)
      .attr('stroke', '#111').attr('stroke-width', 0.5)
      .style('cursor', 'pointer')

    // ── Arc pasangan ──
    const spouseArcs = []
    root.descendants().filter(d => d.depth > 0).forEach(d => {
      const spouses = spouseMap[d.data.id]
      if (!spouses?.length) return
      const full = d._x1_full || d.x1
      const spanTotal = full - (d._x1_full ? d.x1 + 0.003 : d.x0)
      spouses.forEach((sp, i) => {
        const w = spanTotal / spouses.length
        spouseArcs.push({
          x0: d.x1 + 0.003 + i * w,
          x1: d.x1 + 0.003 + (i + 1) * w,
          y0: d.y0, y1: d.y1,
          person: sp, anchorNode: d,
        })
      })
    })

    const spousePathGen = d3.arc()
      .startAngle(d => d.x0).endAngle(d => d.x1)
      .innerRadius(d => d.y0).outerRadius(d => d.y1 - 2)
      .padAngle(0.004).padRadius(radius / 2).cornerRadius(2)

    const spousePaths = g.selectAll('path.spouse')
      .data(spouseArcs).join('path').attr('class', 'spouse')
      .attr('d', spousePathGen)
      .attr('fill', d => getSpouseColor(d.person))
      .attr('fill-opacity', 0.75)
      .attr('stroke', '#666').attr('stroke-width', 0.8)
      .attr('stroke-dasharray', '2,2')
      .style('cursor', 'pointer')

    // ── Label ──
    const labelG = g.append('g').attr('pointer-events', 'none')

    function redrawLabels(focus) {
      labelG.selectAll('*').remove()
      const allNodes = root.descendants().filter(d => d.depth > 0 && visible(d, focus))

      allNodes.forEach(d => {
        const x0 = d.current.x0
        const x1 = d.current.x1
        const midAngle  = (x0 + x1) / 2
        const midRadius = (d.current.y0 + d.current.y1) / 2
        const arcLen    = (x1 - x0) * midRadius
        const fontSize  = Math.min(11, Math.max(5.5, arcLen / 11))
        const maxChars  = Math.floor(arcLen / (fontSize * 0.56))
        if (maxChars < 2) return

        const name = (d.data.name || '').replace(' (+)', '')
        const firstName = name.split(' ')[0]
        let label = firstName
        if (label.length > maxChars) label = label.slice(0, maxChars - 1) + '…'

        const deg  = midAngle * 180 / Math.PI - 90
        const flip = deg > 90 && deg < 270

        labelG.append('text')
          .attr('transform', `rotate(${deg}) translate(${midRadius},0) rotate(${flip ? 180 : 0})`)
          .attr('dy', '0.35em').attr('text-anchor', 'middle')
          .attr('fill', '#fff').attr('font-size', fontSize).attr('opacity', 0.92)
          .text(label)
      })

      // Label pasangan
      spouseArcs.filter(d => visible(d.anchorNode, focus)).forEach(d => {
        const midAngle  = (d.x0 + d.x1) / 2
        const midRadius = (d.y0 + d.y1) / 2
        const arcLen    = (d.x1 - d.x0) * midRadius
        const fontSize  = Math.min(10, Math.max(5.5, arcLen / 11))
        const maxChars  = Math.floor(arcLen / (fontSize * 0.56))
        if (maxChars < 2) return

        const name = (d.person?.name || '').replace(' (+)', '')
        let label = name.split(' ')[0]
        if (label.length > maxChars) label = label.slice(0, maxChars - 1) + '…'

        const deg  = midAngle * 180 / Math.PI - 90
        const flip = deg > 90 && deg < 270
        labelG.append('text')
          .attr('transform', `rotate(${deg}) translate(${midRadius},0) rotate(${flip ? 180 : 0})`)
          .attr('dy', '0.35em').attr('text-anchor', 'middle')
          .attr('fill', '#ddd').attr('font-size', fontSize)
          .attr('font-style', 'italic').attr('opacity', 0.88)
          .text(label)
      })
    }

    // ── Center label (nama fokus) ──
    const centerLabel = g.append('text').attr('text-anchor', 'middle')
      .attr('dy', '-0.3em').attr('fill', '#fff').attr('font-size', 13).attr('font-weight', 'bold')
    const centerSub = g.append('text').attr('text-anchor', 'middle')
      .attr('dy', '1em').attr('fill', '#aaa').attr('font-size', 10)

    function setCenterLabel(node) {
      const name = node.data.name || 'Ompu Raja Doli'
      const parts = name.split(' ')
      centerLabel.text(parts.slice(0, 2).join(' '))
      centerSub.text(parts.slice(2).join(' ') || '')
    }

    // ── Drill-down logic ──
    let focus = root
    setBreadcrumb([{ name: root.data.name, node: root }])

    function clicked(event, p) {
      // Klik root → naik ke parent (jika bukan root absolut)
      const newFocus = (p === focus && p.parent) ? p.parent : p
      if (newFocus === focus) return

      focus = newFocus

      // Update breadcrumb
      const trail = []
      let cur = focus
      while (cur) { trail.unshift({ name: cur.data.name, node: cur }); cur = cur.parent }
      setBreadcrumb(trail)

      setCenterLabel(focus)

      // Hitung transform: re-scale agar subtree focus mengisi lingkaran penuh
      const t = TAU / (focus.x1 - focus.x0)  // scale sudut
      const maxDepth = focus.height           // berapa generasi di bawah

      root.each(d => {
        d.target = {
          x0: Math.max(0, Math.min(1, (d.x0 - focus.x0) / (focus.x1 - focus.x0))) * TAU,
          x1: Math.max(0, Math.min(1, (d.x1 - focus.x0) / (focus.x1 - focus.x0))) * TAU,
          y0: d.depth <= focus.depth ? 0 : (d.y0 - focus.y1) / (radius - focus.y1) * radius,
          y1: d.depth <= focus.depth ? 0 : (d.y1 - focus.y1) / (radius - focus.y1) * radius,
        }
        // Pasangan ikut arc utama
        if (spouseMap[d.data.id]?.length) {
          const xSpan = d.target.x1 - d.target.x0
          d.target.x1 = d.target.x0 + xSpan * (1 - SPOUSE_FRAC) - 0.003
        }
      })

      // Update spouse arc targets
      spouseArcs.forEach(sa => {
        const an = sa.anchorNode
        if (!an.target) return
        const full_x1 = an.target.x0 + (an.target.x1 - an.target.x0) / (1 - SPOUSE_FRAC)
        const spanTotal = full_x1 - an.target.x1 - 0.003
        const idx = spouseArcs.filter(s => s.anchorNode === an).indexOf(sa)
        const count = spouseArcs.filter(s => s.anchorNode === an).length
        sa.targetX0 = an.target.x1 + 0.003 + idx * (spanTotal / count)
        sa.targetX1 = an.target.x1 + 0.003 + (idx + 1) * (spanTotal / count)
        sa.targetY0 = an.target.y0
        sa.targetY1 = an.target.y1
      })

      const transition = g.transition().duration(750)
        .tween('scale', () => {
          return t => {
            root.each(d => {
              d.current = {
                x0: d3.interpolate(d.current.x0, d.target.x0)(t),
                x1: d3.interpolate(d.current.x1, d.target.x1)(t),
                y0: d3.interpolate(d.current.y0, d.target.y0)(t),
                y1: d3.interpolate(d.current.y1, d.target.y1)(t),
              }
            })
            spouseArcs.forEach(sa => {
              sa.x0 = d3.interpolate(sa.x0, sa.targetX0 ?? sa.x0)(t)
              sa.x1 = d3.interpolate(sa.x1, sa.targetX1 ?? sa.x1)(t)
              sa.y0 = d3.interpolate(sa.y0, sa.targetY0 ?? sa.y0)(t)
              sa.y1 = d3.interpolate(sa.y1, sa.targetY1 ?? sa.y1)(t)
            })
          }
        })

      paths.transition(transition)
        .attr('d', arcCurrent)
        .attr('fill-opacity', d => visible(d, focus) ? (d.data.isInti ? 0.88 : 0.72) : 0)

      spousePaths.transition(transition)
        .attr('d', spousePathGen)
        .attr('fill-opacity', d => visible(d.anchorNode, focus) ? 0.75 : 0)

      transition.on('end', () => redrawLabels(focus))
      redrawLabels(focus)
    }

    paths.on('click', clicked)
      .on('mousemove', (event, d) => {
        const [mx, my] = d3.pointer(event, container)
        setTooltip({ x: mx + 12, y: my - 10, person: d.data.person, isSpouse: false })
        d3.select(event.currentTarget).attr('fill-opacity', 1).attr('stroke', '#fff').attr('stroke-width', 1.5)
      })
      .on('mouseleave', (event, d) => {
        setTooltip(null)
        d3.select(event.currentTarget)
          .attr('fill-opacity', d.data.isInti ? 0.88 : 0.72)
          .attr('stroke', '#111').attr('stroke-width', 0.5)
      })

    spousePaths
      .on('mousemove', (event, d) => {
        const [mx, my] = d3.pointer(event, container)
        setTooltip({ x: mx + 12, y: my - 10, person: d.person, isSpouse: true })
        d3.select(event.currentTarget).attr('fill-opacity', 1).attr('stroke', '#fff').attr('stroke-width', 1.5)
      })
      .on('mouseleave', (event) => {
        setTooltip(null)
        d3.select(event.currentTarget).attr('fill-opacity', 0.75).attr('stroke', '#666').attr('stroke-width', 0.8)
      })
      .on('click', (event, d) => setInfo(d.person))

    // Klik center → naik satu level
    g.append('circle').attr('r', root.y1 / root.descendants().filter(d => d.depth === 1).length || 60)
      .attr('fill', 'transparent').style('cursor', 'pointer')
      .on('click', () => {
        if (focus.parent) clicked(null, focus.parent)
      })

    // Init label & center
    setCenterLabel(root)
    redrawLabels(root)
    stateRef.current = { clicked, root, focus: () => focus }

  }, [])

  const btnBase = {
    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
    color: '#fff', borderRadius: 6, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>

      {/* Breadcrumb navigasi */}
      <div style={{
        height: 40, flexShrink: 0, display: 'flex', alignItems: 'center',
        gap: 4, padding: '0 16px', background: 'rgb(15,15,15)',
        borderBottom: '1px solid #2a2a2a', overflowX: 'auto',
      }}>
        {breadcrumb.map((item, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span style={{ color: '#555' }}>›</span>}
            <button
              onClick={() => stateRef.current?.clicked(null, item.node)}
              style={{
                ...btnBase, background: 'none', border: 'none',
                color: i === breadcrumb.length - 1 ? '#7eb3ff' : '#999',
                fontSize: 12, padding: '2px 6px',
                fontWeight: i === breadcrumb.length - 1 ? 600 : 400,
              }}
            >
              {item.name.replace(' (+)', '')}
            </button>
          </span>
        ))}
        <span style={{ marginLeft: 8, color: '#555', fontSize: 11 }}>← klik arc untuk drill-down · klik tengah untuk naik</span>
      </div>

      {/* Chart + panel */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden' }}>
        <div ref={containerRef} style={{ flex: 1, height: '100%' }} />

        {/* Panel detail */}
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
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x, top: tooltip.y + 40, zIndex: 200,
          background: 'rgba(0,0,0,0.88)', border: '1px solid #555',
          borderRadius: 6, padding: '8px 12px', pointerEvents: 'none',
          color: '#fff', fontSize: 12, maxWidth: 240,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 3 }}>
            {tooltip.isSpouse ? '👫 ' : ''}{tooltip.person?.name}
          </div>
          {tooltip.person && <>
            <div style={{ color: '#aaa' }}>
              {tooltip.person.generation ? `Gen ${tooltip.person.generation} · ` : ''}
              {tooltip.person.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
              {tooltip.isSpouse ? ' · Pasangan' : ''}
            </div>
            {tooltip.person.marga && <div style={{ color: '#aaa' }}>Marga: {tooltip.person.marga}</div>}
            {tooltip.person.city  && <div style={{ color: '#aaa' }}>{tooltip.person.city}</div>}
          </>}
        </div>
      )}

      {/* Legenda */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16, zIndex: 100,
        background: 'rgba(0,0,0,0.75)', borderRadius: 8, border: '1px solid #333',
        padding: '10px 14px', fontSize: 11, color: '#ccc',
        display: 'flex', flexDirection: 'column', gap: 5,
      }}>
        {[
          { color: '#2563eb', label: 'Laki-laki Sirait (penerus marga)' },
          { color: '#be185d', label: 'Perempuan Sirait (boru)' },
          { color: '#0e7490', label: 'Keturunan laki dari boru (cabang)' },
          { color: '#c2410c', label: 'Keturunan perempuan dari boru (cabang)' },
          { color: '#3a1f5c', dashed: true, label: 'Istri dari laki-laki Sirait', italic: true },
          { color: '#1a3d2e', dashed: true, label: 'Suami dari boru Sirait', italic: true },
        ].map(item => (
          <div key={item.color} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color, flexShrink: 0, border: item.dashed ? '1.5px dashed #888' : 'none' }} />
            <span style={{ fontStyle: item.italic ? 'italic' : 'normal' }}>{item.label}</span>
          </div>
        ))}
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
