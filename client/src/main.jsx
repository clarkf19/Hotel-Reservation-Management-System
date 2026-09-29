import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { VivaProvider } from './components/viva/VivaContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <VivaProvider>
          <App />
          <Toaster position="top-right" richColors closeButton toastOptions={{ style: { fontFamily: 'Inter Variable, sans-serif' } }} />
        </VivaProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
