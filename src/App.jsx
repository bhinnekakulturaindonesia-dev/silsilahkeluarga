import { useEffect, useRef, useState } from 'react'
import * as f3 from 'family-chart'
import 'family-chart/styles/family-chart.css'
import './App.css'
import { convertToF3 } from './convertData'
import Configure from './Configure'
import SunburstChart from './SunburstChart'

const { manualZoom } = f3.handlers || {}

// Palet warna per tipe kartu
const CARD_COLORS = {
  'sirait-male':    { bg: '#1a3a5c', border: '#4a90d9' }, // laki Sirait — biru tua
  'sirait-female':  { bg: '#5c1a2e', border: '#e87da0' }, // boru Sirait — rose
  'spouse-female':  { bg: '#3a1f5c', border: '#a78bfa' }, // istri laki Sirait — ungu
  'spouse-male':    { bg: '#1a3d2e', border: '#4ade80' }, // suami boru Sirait — hijau
  'branch-male':    { bg: '#0f3340', border: '#22d3ee' }, // keturunan laki cabang — teal
  'branch-female':  { bg: '#3d2010', border: '#fb923c' }, // keturunan perempuan cabang — oranye
}

/**
 * Inject warna langsung ke .card-inner (elemen HTML kartu family-chart).
 * Kartu HTML ada di: #FamilyChart #f3Canvas #htmlSvg .cards_view .card_cont
 */
function applyCardColors(container) {
  // Kartu HTML ada di #htmlSvg, bukan di SVG
  const htmlView = container.querySelector('#htmlSvg .cards_view')
  const scope = htmlView || container

  const cards = scope.querySelectorAll('.card_cont')

  cards.forEach(el => {
    const d = el.__data__
    if (!d) return

    // card_type ada di d.data.data (karena struktur f3: d.data = node f3, d.data.data = field data kita)
    const cardType = d.data?.data?.card_type || d.data?.card_type
    if (!cardType) return

    const palette = CARD_COLORS[cardType]
    if (!palette) return

    const cardInner = el.querySelector('.card-inner')
    if (cardInner) {
      cardInner.style.setProperty('background-color', palette.bg, 'important')
      cardInner.style.setProperty('border-left', `3px solid ${palette.border}`, 'important')
    }
  })
}

function App() {
  const chartRef       = useRef(null)
  const chartInstance  = useRef(null)
  const svgRef         = useRef(null)
  const [activeTab,  setActiveTab]  = useState('pohon') // 'pohon' | 'sunburst'
  const [showConfig, setShowConfig] = useState(false)
  const [config, setConfig] = useState({
    rows: ['first name', 'birthday'],
    cardW: 260,
    cardH: 80,
    spacingX: 300,
    spacingY: 130,
    showMiniTree: true,
    hoverPathToMain: true,
    transitionTime: 1000,
    cardStyle: 'imageRect',
    orientation: 'vertical',
  })

  useEffect(() => {
    if (activeTab !== 'pohon') return
    if (!chartRef.current) return

    const container = document.querySelector('#FamilyChart')
    if (container) container.innerHTML = ''
    chartInstance.current = null
    svgRef.current = null

    const data = convertToF3()
    const chart = f3.createChart('#FamilyChart', data)

    chart.setTransitionTime(config.transitionTime)
    chart.setCardXSpacing(config.spacingX)
    chart.setCardYSpacing(config.spacingY)

    if (config.orientation === 'horizontal') {
      chart.setOrientationHorizontal()
    } else {
      chart.setOrientationVertical()
    }

    const displayRows = config.rows.filter(Boolean).map(row => [row])

    const card = chart.setCardHtml()
      .setCardDisplay(displayRows)
      .setCardDim({ width: config.cardW, height: config.cardH })
      .setMiniTree(config.showMiniTree)
      .setStyle(config.cardStyle)
      .setCardInnerHtmlCreator((d) => {
        // d.data.data = field data kita, termasuk card_type
        const cardType = d.data?.data?.card_type
        const palette  = CARD_COLORS[cardType] || { bg: '#2a2a2a', border: '#555' }
        const name     = d.data?.data?.['first name'] || ''
        const bday     = d.data?.data?.birthday || ''
        const rows     = config.rows.filter(Boolean)
        const textRows = rows.map(r => {
          const val = d.data?.data?.[r] || ''
          return val ? `<div class="card-label-row" style="font-size:11px;opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${val}</div>` : ''
        }).join('')

        return `<div style="
          width:100%; height:100%;
          background-color:${palette.bg};
          border-left: 3px solid ${palette.border};
          border-radius: 4px;
          display:flex; flex-direction:column; justify-content:center;
          padding: 0 8px; box-sizing:border-box; color:#fff;
          overflow:hidden;
        ">${textRows}</div>`
      })

    if (config.hoverPathToMain) {
      card.setOnHoverPathToMain()
    } else {
      card.unsetOnHoverPathToMain()
    }

    // Hook afterUpdate → inject warna setiap kali tree dirender ulang
    chart.afterUpdate = () => {
      applyCardColors(container)
    }

    chart.updateTree({ initial: true })

    setTimeout(() => {
      const svg = container.querySelector('svg.main_svg')
      if (!svg) return
      svgRef.current = svg

      // Override treeFit → center ke orang pertama ukuran normal
      const firstNode = chart.store.getTree()?.data?.[0]
      if (firstNode && f3.handlers?.cardToMiddle) {
        f3.handlers.cardToMiddle({
          datum: firstNode,
          svg,
          svg_dim: container.getBoundingClientRect(),
          scale: 1,
          transition_time: 0,
        })
      }

      // Inject warna pertama kali
      applyCardColors(container)

      // Klik kartu → navigasi
      container.querySelectorAll('.card_cont').forEach(el => {
        el.style.cursor = 'pointer'
        el.addEventListener('click', function () {
          const d = this.__data__
          if (d) chart.updateTree({ initial: false, data: d, tree_position: 'main_to_middle' })
        })
      })
    }, 300)

    chartInstance.current = chart
  }, [config, activeTab])

  // Zoom controls
  const handleZoomIn  = () => { if (svgRef.current && manualZoom) manualZoom({ amount: 1.3,       svg: svgRef.current, transition_time: 300 }) }
  const handleZoomOut = () => { if (svgRef.current && manualZoom) manualZoom({ amount: 1 / 1.3,   svg: svgRef.current, transition_time: 300 }) }
  const handleFit     = () => { if (chartInstance.current) chartInstance.current.updateTree({ tree_position: 'fit', transition_time: 500 }) }
  const handleReset   = () => {
    const container = document.querySelector('#FamilyChart')
    if (!container || !svgRef.current || !chartInstance.current) return
    const firstNode = chartInstance.current.store.getTree()?.data?.[0]
    if (firstNode && f3.handlers?.cardToMiddle) {
      f3.handlers.cardToMiddle({
        datum: firstNode,
        svg: svgRef.current,
        svg_dim: container.getBoundingClientRect(),
        scale: 1,
        transition_time: 500,
      })
    }
  }

  const btnBase = {
    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
    color: '#fff', width: 36, height: 36, borderRadius: 6, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
    flexShrink: 0,
  }

  const TAB_STYLE = (active) => ({
    padding: '6px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    fontWeight: active ? 600 : 400,
    background: active ? 'rgba(90,140,255,0.25)' : 'rgba(255,255,255,0.07)',
    border: active ? '1px solid rgba(90,140,255,0.6)' : '1px solid rgba(255,255,255,0.15)',
    color: active ? '#7eb3ff' : '#aaa',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', backgroundColor: 'rgb(22,22,22)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 16px',
        background: 'rgb(15,15,15)',
        borderBottom: '1px solid #2a2a2a',
        zIndex: 200,
      }}>
        {/* Judul */}
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginRight: 12, whiteSpace: 'nowrap' }}>
          🌳 Silsilah Keluarga
        </span>

        {/* Tab switcher */}
        <button onClick={() => setActiveTab('pohon')}    style={TAB_STYLE(activeTab === 'pohon')}>🌿 Pohon</button>
        <button onClick={() => setActiveTab('sunburst')} style={TAB_STYLE(activeTab === 'sunburst')}>🔵 Sunburst</button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Konfigurasi — hanya di tab pohon */}
        {activeTab === 'pohon' && (
          <button
            onClick={() => setShowConfig(v => !v)}
            style={{ ...btnBase, width: 'auto', padding: '0 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ⚙️ Konfigurasi
          </button>
        )}
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* ── TAB: POHON ── */}
        <div style={{ display: activeTab === 'pohon' ? 'block' : 'none', width: '100%', height: '100%', position: 'relative' }}>

          {/* Tombol zoom kanan bawah */}
          <div style={{ position: 'absolute', bottom: 24, right: 24, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button title="Zoom In"   onClick={handleZoomIn}  style={btnBase}>＋</button>
            <button title="Zoom Out"  onClick={handleZoomOut} style={btnBase}>－</button>
            <button title="Fit semua" onClick={handleFit}     style={{ ...btnBase, fontSize: 14 }}>⊡</button>
            <button title="Ke akar"   onClick={handleReset}   style={{ ...btnBase, fontSize: 14 }}>⌂</button>
          </div>

          {showConfig && (
            <Configure
              config={config}
              onChange={setConfig}
              onClose={() => setShowConfig(false)}
            />
          )}

          <div
            id="FamilyChart"
            className="f3"
            ref={chartRef}
            style={{ width: '100%', height: '100%', color: '#fff' }}
          />
        </div>

        {/* ── TAB: SUNBURST ── */}
        {activeTab === 'sunburst' && (
          <div style={{ width: '100%', height: '100%' }}>
            <SunburstChart />
          </div>
        )}
      </div>
    </div>
  )
}

export default App
