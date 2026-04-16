import { Outlet } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { AudioFilesProvider } from '../lib/audioFilesContext';

export default function AppDataLayout() {
  return (
    <ProtectedRoute>
      <AudioFilesProvider>
        <Outlet />
      </AudioFilesProvider>
    </ProtectedRoute>
  );
}
