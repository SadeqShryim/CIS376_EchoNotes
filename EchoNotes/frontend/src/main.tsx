import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getOrCreateSessionToken } from './lib/sessionToken.ts'
import { initSession } from './lib/apiClient.ts'

getOrCreateSessionToken();

await initSession()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
