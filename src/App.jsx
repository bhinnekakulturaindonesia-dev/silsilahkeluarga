import { useEffect, useRef, useState } from 'react'
import * as f3 from 'family-chart'
import 'family-chart/styles/family-chart.css'
import './App.css'
import { convertToF3 } from './convertData'
import Configure from './Configure'

const { manualZoom } = f3.handlers || {}

// Legend warna kartu
const LEGEND = [
  { type: 'sirait-male',    color: '#1a3a5c', border: '#4a90d9', label: 'Laki-laki Sirait (penerus marga)' },
  { type: 'sirait-female',  color: '#5c1a2e', border: '#e87da0', label: 'Perempuan Sirait (boru)' },
  { type: 'spouse-female',  color: '#3a1f5c', border: '#a78bfa', label: 'Istri dari laki-laki Sirait' },
  { type: 'spouse-male',    color: '#1a3d2e', border: '#4ade80', label: 'Suami dari boru Sirait' },
  { type: 'branch-male',    color: '#0f3340', border: '#22d3ee', label: 'Keturunan laki dari boru (cabang)' },
  { type: 'branch-female',  color: '#3d2010', border: '#fb923c', label: 'Keturunan perempuan dari boru (cabang)' },
]

/**
 * Inject class warna ke semua .card_cont berdasarkan data card_type
 * Dipanggil setiap kali tree dirender ulang.
 */
function applyCardColors(container) {
  container.querySelectorAll('.card_cont').forEach(el => {
    const d = el.__data__
    if (!d?.data?.card_type) return
    const type = d.data.card_type
    // Hapus semua class warna sebelumnya
    el.classList.forEach(cls => {
      if (cls.startsWith('f3-card-')) el.classList.remove(cls)
    })
    el.classList.add(`f3-card-${type}`)
  })
}

function App() {
  const chartRef       = useRef(null)
  const chartInstance  = useRef(null)
  const svgRef         = useRef(null)
  const [showConfig,   setShowConfig]   = useState(false)
  const [showLegend,   setShowLegend]   = useState(true)
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
        <button
          onClick={() => setShowLegend(v => !v)}
          title="Tampilkan/sembunyikan legenda"
          style={{ ...btnBase, width: 'auto', padding: '0 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          🎨 Legenda
        </button>
      </div>

      {/* Tombol zoom kanan bawah */}
      <div style={{ position: 'absolute', bottom: 24, right: 24, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button title="Zoom In"   onClick={handleZoomIn}  style={btnBase}>＋</button>
        <button title="Zoom Out"  onClick={handleZoomOut} style={btnBase}>－</button>
        <button title="Fit semua" onClick={handleFit}     style={{ ...btnBase, fontSize: 14 }}>⊡</button>
        <button title="Ke akar"   onClick={handleReset}   style={{ ...btnBase, fontSize: 14 }}>⌂</button>
      </div>

      {/* Legenda warna */}
      {showLegend && (
        <div className="color-legend">
          {LEGEND.map(item => (
            <div key={item.type} className="color-legend-item">
              <div
                className="color-legend-dot"
                style={{ background: item.color, borderColor: item.border }}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}

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
