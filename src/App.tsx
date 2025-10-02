import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';

// Pages
import Login from './pages/Login';
import Signup from './pages/Signup';
import AcceptInvite from './pages/AcceptInvite';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import TestLinkForm from './pages/TestLinkForm';
import RecordingPlayer from './pages/RecordingPlayer';
import LiveViewer from './pages/LiveViewer';
import TesterFlow from './pages/TesterFlow';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  return user ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/t/:slug" element={<TesterFlow />} />

        {/* Private routes */}
        <Route
          path="/app"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/app/projects/:projectId"
          element={
            <PrivateRoute>
              <ProjectDetail />
            </PrivateRoute>
          }
        />
        <Route
          path="/app/projects/:projectId/test-links/new"
          element={
            <PrivateRoute>
              <TestLinkForm />
            </PrivateRoute>
          }
        />
        <Route
          path="/app/projects/:projectId/test-links/:id"
          element={
            <PrivateRoute>
              <TestLinkForm />
            </PrivateRoute>
          }
        />
        <Route
          path="/app/recordings/:id"
          element={
            <PrivateRoute>
              <RecordingPlayer />
            </PrivateRoute>
          }
        />
        <Route
          path="/app/live/:liveSessionId"
          element={
            <PrivateRoute>
              <LiveViewer />
            </PrivateRoute>
          }
        />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/app" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
