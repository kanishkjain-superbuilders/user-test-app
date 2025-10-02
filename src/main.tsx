import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useAuthStore } from './store/auth'
import { Toaster } from '@/components/ui/sonner'

function Root() {
  useEffect(() => {
    useAuthStore.getState().initialize()
  }, [])

  return (
    <>
      <App />
      <Toaster />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
