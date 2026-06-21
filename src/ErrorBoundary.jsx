import React from 'react'

// Error boundaries MUST be class components (React has no functional equivalent).
// A render-time throw anywhere below this never blanks the demo — it shows a
// friendly black-gold fallback, and memory is safe in HydraDB regardless.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[Continuity] render error:', error, info)
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#050506', color: '#ECE6D6', fontFamily: "'VT323', monospace", textAlign: 'center', padding: 24 }}>
          <div>
            <div style={{ color: '#D9A93A', fontSize: 22, letterSpacing: 3, textShadow: '0 0 14px rgba(217,169,58,0.4)' }}>CONTINUITY</div>
            <p style={{ fontSize: 24, marginTop: 18, color: '#ECE6D6' }}>Hit a snag — your memory is safe in HydraDB.</p>
            <button
              onClick={() => window.location.reload()}
              style={{ marginTop: 14, background: '#D9A93A', color: '#0a0a0a', border: 'none', padding: '11px 22px', borderRadius: 4, fontFamily: "'VT323', monospace", fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
            >
              Reload to continue
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
