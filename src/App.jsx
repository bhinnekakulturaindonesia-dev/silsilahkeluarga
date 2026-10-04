import { useEffect, useRef, useState } from 'react'
import * as f3 from 'family-chart'
import 'family-chart/styles/family-chart.css'
import './App.css'
import { convertToF3 } from './convertData'
import Configure from './Configure'

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
 * Dipanggil setiap kali tree dirender ulang.
 */
function applyCardColors(container) {
  container.querySelectorAll('.card_cont').forEach(el => {
    const d = el.__data__
    if (!d?.data?.card_type) return
    const palette = CARD_COLORS[d.data.card_type]
    if (!palette) return

    const cardInner = el.querySelector('.card-inner')
    if (cardInner) {
      cardInner.style.backgroundColor = palette.bg
      cardInner.style.borderLeft      = `3px solid ${palette.border}`
    }
  })
}

function App() {
  const chartRef       = useRef(null)
  const chartInstance  = useRef(null)
  const svgRef         = useRef(null)
  const [showConfig, setShowConfig]   = useState(false)
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
  }, [config])

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

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', backgroundColor: 'rgb(22,22,22)' }}>

      {/* Toolbar kiri atas */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 100, display: 'flex', gap: 8 }}>
        <button
          onClick={() => setShowConfig(v => !v)}
          style={{ ...btnBase, width: 'auto', padding: '0 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          ⚙️ Konfigurasi
        </button>
      </div>

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
        style={{ width: '100%', height: '100vh', color: '#fff' }}
      />
    </div>
  )
}

export default App
