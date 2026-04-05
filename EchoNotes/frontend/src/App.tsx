import AudioUploadTest from './components/AudioUploadTest'
import './App.css'

function App() {
  return (
    <main className="app-shell">
      <section className="hero-section">
        <div className="hero-content">
          <p className="eyebrow">CIS 376 Project</p>
          <h1>EchoNotes Audio Upload</h1>
          <p className="hero-text">
            Upload an audio file for validated processing through the EchoNotes backend.
            This page is focused on UC-1, reliable audio upload with clear feedback.
          </p>
        </div>
      </section>

      <section className="upload-page-section">
        <AudioUploadTest />
      </section>
    </main>
  )
}

export default App