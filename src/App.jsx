import { useEffect, useRef, useState } from 'react'
import * as f3 from 'family-chart'
import 'family-chart/styles/family-chart.css'
import './App.css'
import { convertToF3 } from './convertData'
import Configure from './Configure'

// Akses handlers zoom dari family-chart
const { zoomTo, manualZoom } = f3.handlers || {}

function App() {
  const chartRef = useRef(null)
  const chartInstance = useRef(null)
  const svgRef = useRef(null)
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

    const displayRows = config.rows
      .filter(Boolean)
      .map(row => [row])

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

    // Pakai initial:true seperti demo resmi (render semua node),
    // lalu setelah render selesai override zoom ke scale 1 fokus ke orang pertama
    chart.updateTree({ initial: true })

    setTimeout(() => {
      const svg = container.querySelector('svg.main_svg')
      if (!svg) return
      svgRef.current = svg

      // Ambil tree node pertama (sudah punya koordinat x,y setelah render)
      const treeData = chart.store.getTree()
      const firstNode = treeData?.data?.[0]

      if (firstNode && f3.handlers?.cardToMiddle) {
        // Override hasil treeFit → center ke orang pertama, scale 1 (ukuran normal)
        f3.handlers.cardToMiddle({
          datum: firstNode,
          svg,
          svg_dim: container.getBoundingClientRect(),
          scale: 1,
          transition_time: 0,
        })
      } else if (zoomTo) {
        zoomTo(svg, 1)
      }

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

  // Handler tombol zoom
  const handleZoomIn  = () => { if (svgRef.current && manualZoom) manualZoom({ amount: 1.3, svg: svgRef.current, transition_time: 300 }) }
  const handleZoomOut = () => { if (svgRef.current && manualZoom) manualZoom({ amount: 1 / 1.3, svg: svgRef.current, transition_time: 300 }) }
  const handleFit     = () => { if (chartInstance.current) chartInstance.current.updateTree({ tree_position: 'fit', transition_time: 500 }) }
  const handleReset = () => {
    const container = document.querySelector('#FamilyChart')
    if (!container || !svgRef.current) return
    if (f3.handlers?.cardToMiddle && chartInstance.current) {
      f3.handlers.cardToMiddle({
        datum: chartInstance.current.store.getTree().data[0],
        svg: svgRef.current,
        svg_dim: container.getBoundingClientRect(),
        scale: 1,
        transition_time: 500,
      })
    } else if (zoomTo && svgRef.current) {
      zoomTo(svgRef.current, 1)
    }
  }

  const btnBase = {
    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
    color: '#fff', width: 36, height: 36, borderRadius: 6, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
    flexShrink: 0,
  }

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', backgroundColor: 'rgb(33,33,33)' }}>

      {/* Toolbar kiri atas */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 100, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => setShowConfig(v => !v)}
          style={{
            ...btnBase, width: 'auto', padding: '0 14px', fontSize: 13, gap: 6,
            display: 'flex', alignItems: 'center',
          }}
        >
          ⚙️ Konfigurasi
        </button>
      </div>

      {/* Tombol zoom kanan bawah */}
      <div style={{
        position: 'absolute', bottom: 24, right: 24, zIndex: 100,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <button title="Zoom In"  onClick={handleZoomIn}  style={btnBase}>＋</button>
        <button title="Zoom Out" onClick={handleZoomOut} style={btnBase}>－</button>
        <button title="Fit semua" onClick={handleFit}    style={{ ...btnBase, fontSize: 14 }}>⊡</button>
        <button title="Ke akar"   onClick={handleReset}  style={{ ...btnBase, fontSize: 14 }}>⌂</button>
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
