/**
 * ---------------------------------------------------------------------------
 * Router de la aplicación: dos superficies en un solo bundle.
 * ---------------------------------------------------------------------------
 *  Público  → /i/:slug            invitación general (link de WhatsApp masivo)
 *             /i/:slug/:token      invitación personalizada del invitado
 *  Panel    → /admin/...          login + gestión (protegido con RequireAuth)
 */

import { useEffect } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { SessionProvider, RequireAuth } from './lib/session';
import { ToastProvider } from './admin/ui';
import InvitationPage from './invitation/InvitationPage';
import LoginPage from './admin/LoginPage';
import AdminLayout from './admin/AdminLayout';
import AdminIndexPage from './admin/AdminIndexPage';
import WeddingsPage from './admin/WeddingsPage';
import WeddingEditorPage from './admin/WeddingEditorPage';
import GuestsPage from './admin/GuestsPage';
import ImportPage from './admin/ImportPage';
import CampaignsPage from './admin/CampaignsPage';
import WhatsAppPage from './admin/WhatsAppPage';

function NotFoundPage(): JSX.Element {
  return (
    <div className="notfound">
      <div className="col center stack">
        <h1>Esta página no existe</h1>
        <p className="muted">
          Puede que el enlace esté incompleto o que la invitación ya no esté publicada.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn--primary" to="/admin">
            Ir al panel
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Al cambiar de ruta se vuelve arriba: en el teléfono es lo esperado. */
function ScrollToTop(): null {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <SessionProvider>
        <ToastProvider>
          <Routes>
            {/* --- Invitación pública ------------------------------------- */}
            <Route path="/i/:slug" element={<InvitationPage />} />
            <Route path="/i/:slug/:token" element={<InvitationPage />} />

            {/* --- Sesión ------------------------------------------------- */}
            <Route path="/admin/login" element={<LoginPage />} />

            {/* --- Panel -------------------------------------------------- */}
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <AdminLayout />
                </RequireAuth>
              }
            >
              <Route index element={<AdminIndexPage />} />
              <Route path="weddings" element={<WeddingsPage />} />
              <Route path="weddings/:weddingId" element={<WeddingEditorPage />} />
              <Route path="weddings/:weddingId/guests" element={<GuestsPage />} />
              <Route path="weddings/:weddingId/import" element={<ImportPage />} />
              <Route path="weddings/:weddingId/campaigns" element={<CampaignsPage />} />
              <Route path="whatsapp" element={<WhatsAppPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
