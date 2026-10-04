function Configure({ config, onChange, onClose }) {
  const fields = ['first name', 'birthday', 'occupation', 'education', 'generation', 'address', 'city', 'phone', 'email', 'marga']

  const update = (key, value) => onChange(prev => ({ ...prev, [key]: value }))

  const updateRow = (index, value) => {
    const rows = [...config.rows]
    rows[index] = value
    update('rows', rows)
  }

  const addRow = () => update('rows', [...config.rows, ''])

  const removeRow = (index) => {
    const rows = config.rows.filter((_, i) => i !== index)
    update('rows', rows)
  }

  const labelStyle = { fontSize: 13, color: '#ccc', display: 'block', marginBottom: 6 }
  const selectStyle = { width: '100%', padding: '6px 8px', borderRadius: 4, background: 'rgb(40,40,40)', color: '#fff', border: '1px solid #444' }
  const sectionTitleStyle = { fontSize: 12, color: '#aaa', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }

  const Toggle = ({ label, checked, onChange: onToggle }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <span style={{ fontSize: 13, color: '#ccc' }}>{label}</span>
      <label style={{ position: 'relative', display: 'inline-block', width: 38, height: 20, flexShrink: 0 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onToggle(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span style={{
          position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: checked ? 'rgb(90,140,255)' : 'rgb(70,70,70)',
          borderRadius: 20, transition: '0.2s'
        }}>
          <span style={{
            position: 'absolute', height: 14, width: 14, left: checked ? 21 : 3, top: 3,
            backgroundColor: '#fff', borderRadius: '50%', transition: '0.2s'
          }} />
        </span>
      </label>
    </div>
  )

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, zIndex: 200,
      width: 300, height: '100vh', overflowY: 'auto',
      backgroundColor: 'rgb(20,20,20)', color: '#fff',
      padding: '20px 16px', boxShadow: '4px 0 12px rgba(0,0,0,0.5)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>⚙️ Konfigurasi</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>

      {/* Display Fields - dinamis */}
      <section style={{ marginBottom: 24 }}>
        <p style={sectionTitleStyle}>Field yang Ditampilkan</p>

        {config.rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Baris {i + 1}</label>
              <select value={row} onChange={e => updateRow(i, e.target.value)} style={selectStyle}>
                <option value="">— kosong —</option>
                {fields.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <button
              onClick={() => removeRow(i)}
              title="Hapus baris"
              style={{
                marginTop: 20, background: 'rgb(60,40,40)', border: '1px solid #663333',
                color: '#f88', borderRadius: 4, width: 28, height: 28, cursor: 'pointer', flexShrink: 0
              }}
            >✕</button>
          </div>
        ))}

        <button
          onClick={addRow}
          style={{
            width: '100%', padding: '8px', borderRadius: 6, background: 'rgb(40,60,40)',
            color: '#9f9', border: '1px solid #3a5', cursor: 'pointer', fontSize: 13, marginTop: 4
          }}
        >
          + Tambah Baris
        </button>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '0 0 24px' }} />

      {/* Card Elements */}
      <section style={{ marginBottom: 24 }}>
        <p style={sectionTitleStyle}>Elemen Kartu</p>
        <Toggle
          label="Tampilkan Mini Tree"
          checked={config.showMiniTree}
          onChange={v => update('showMiniTree', v)}
        />
        <Toggle
          label="Sorot Jalur ke Utama saat Hover"
          checked={config.hoverPathToMain}
          onChange={v => update('hoverPathToMain', v)}
        />
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '0 0 24px' }} />

      {/* Orientation */}
      <section style={{ marginBottom: 24 }}>
        <p style={sectionTitleStyle}>Arah Tree</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { value: 'vertical', label: 'Vertikal' },
            { value: 'horizontal', label: 'Horizontal' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => update('orientation', opt.value)}
              style={{
                padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                background: config.orientation === opt.value ? 'rgb(90,140,255)' : 'rgb(50,50,50)',
                color: '#fff', border: '1px solid #555'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '0 0 24px' }} />

      {/* Card Style */}
      <section style={{ marginBottom: 24 }}>
        <p style={sectionTitleStyle}>Gaya Kartu</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { value: 'imageRect', label: 'Foto Persegi' },
            { value: 'imageCircle', label: 'Foto Bulat' },
            { value: 'rect', label: 'Tanpa Foto' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => update('cardStyle', opt.value)}
              style={{
                padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                background: config.cardStyle === opt.value ? 'rgb(90,140,255)' : 'rgb(50,50,50)',
                color: '#fff', border: '1px solid #555'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '0 0 24px' }} />

      {/* Card Dimensions */}
      <section style={{ marginBottom: 24 }}>
        <p style={sectionTitleStyle}>Dimensi Kartu</p>

        <label style={labelStyle}>Lebar Kartu: {config.cardW}px</label>
        <input type="range" min={120} max={400} value={config.cardW}
          onChange={e => update('cardW', Number(e.target.value))}
          style={{ width: '100%', marginBottom: 12 }} />

        <label style={labelStyle}>Tinggi Kartu: {config.cardH}px</label>
        <input type="range" min={50} max={200} value={config.cardH}
          onChange={e => update('cardH', Number(e.target.value))}
          style={{ width: '100%' }} />
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '0 0 24px' }} />

      {/* Layout Options */}
      <section style={{ marginBottom: 24 }}>
        <p style={sectionTitleStyle}>Opsi Tata Letak</p>

        <label style={labelStyle}>Jarak X Kartu: {config.spacingX}px</label>
        <input type="range" min={150} max={500} value={config.spacingX}
          onChange={e => update('spacingX', Number(e.target.value))}
          style={{ width: '100%', marginBottom: 12 }} />

        <label style={labelStyle}>Jarak Y Kartu: {config.spacingY}px</label>
        <input type="range" min={80} max={300} value={config.spacingY}
          onChange={e => update('spacingY', Number(e.target.value))}
          style={{ width: '100%', marginBottom: 12 }} />

        <label style={labelStyle}>Waktu Transisi (ms)</label>
        <input
          type="number" min={0} step={100} value={config.transitionTime}
          onChange={e => update('transitionTime', Number(e.target.value))}
          style={selectStyle}
        />
      </section>

      <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '0 0 24px' }} />

      {/* Reset */}
      <button
        onClick={() => onChange({
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
        })}
        style={{ width: '100%', padding: '8px', borderRadius: 6, background: 'rgb(60,60,60)', color: '#fff', border: '1px solid #555', cursor: 'pointer', fontSize: 13 }}
      >
        Reset ke Default
      </button>
    </div>
  )
}

export default Configure
