import { useEffect, useState } from 'react'
import { useContinuity } from './hooks/useContinuity.js'
import { Header, Chat, EnginePanel, LogDock, Toast, Landing } from './components.jsx'

const hashEntered = () => typeof window !== 'undefined' && window.location.hash.indexOf('app') !== -1

export default function App() {
  const c = useContinuity()
  const [entered, setEntered] = useState(hashEntered)
  const [logsOpen, setLogsOpen] = useState(true)

  // Keep React state in sync with the URL hash so a reload (or back/forward)
  // lands the judge back in the app — this is what makes the headline
  // "reload -> memory restored from HydraDB" beat reachable.
  useEffect(() => {
    const onHash = () => setEntered(hashEntered())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (!entered) {
    return <Landing onEnter={() => { window.location.hash = 'app'; setEntered(true) }} />
  }

  const toggleLogs = () => setLogsOpen((v) => !v)
  const restored = c.boot && c.boot.mode === 'restored'
  const degraded = c.snapshot.hydraConfigured && c.snapshot.storeStatus === 'local'

  return (
    <div className="app">
      <Header
        brainMode={c.brainMode}
        storeStatus={c.snapshot.storeStatus}
        pulse={c.pulse}
        onNewSession={c.newSession}
        onToggleLogs={toggleLogs}
        logsOpen={logsOpen}
      />
      {restored && (
        <div className="banner banner-hydra" role="status">
          <span className="banner-dot" />
          <span><b>{c.boot.count} memories restored from HydraDB</b>{c.boot.requestId ? ' · ' + c.boot.requestId.slice(0, 12) : ''} — your context survived the tab close.</span>
          <button className="banner-btn" onClick={() => window.location.reload()}>Reload to prove it</button>
        </div>
      )}
      {degraded && !restored && (
        <div className="banner banner-degraded" role="status">
          <span className="banner-dot" />
          HydraDB unreachable — running on the local working-set safety net.
        </div>
      )}
      <main className="stage">
        <Chat messages={c.messages} busy={c.busy} onSend={c.send} onSendAction={c.sendAction} />
        <EnginePanel snapshot={c.snapshot} highlight={c.highlight} focusId={c.focusId} graph={c.graph} />
      </main>
      <LogDock logs={c.logs} open={logsOpen} onToggle={toggleLogs} />
      <Toast toast={c.toast} />
    </div>
  )
}
