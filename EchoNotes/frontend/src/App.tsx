import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import AppDataLayout from './components/AppDataLayout';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import RecordingsPage from './pages/RecordingsPage';
import UploadPage from './pages/UploadPage';
import NotesPage from './pages/NotesPage';
import ProfilePage from './pages/ProfilePage';
import AudioDetailPage from './pages/AudioDetailPage';
import './App.css';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<AppDataLayout />}>
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/recordings" element={<RecordingsPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/audio/:id" element={<AudioDetailPage />} />
        </Route>
        <Route path="/dashboard" element={<Navigate to="/recordings" replace />} />
        <Route path="/" element={<Navigate to="/recordings" replace />} />
        <Route path="*" element={<Navigate to="/recordings" replace />} />
      </Route>
    </Routes>
  );
}
