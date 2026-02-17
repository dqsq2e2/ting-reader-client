import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import OfflineLayout from './components/OfflineLayout';
import AppInitializer from './components/AppInitializer';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import BookshelfPage from './pages/BookshelfPage';
import BookDetailPage from './pages/BookDetailPage';
import SearchPage from './pages/SearchPage';
import FavoritesPage from './pages/FavoritesPage';
import AdminLibraries from './pages/AdminLibraries';
import AdminUsers from './pages/AdminUsers';
import TaskLogsPage from './pages/TaskLogsPage';
import SettingsPage from './pages/SettingsPage';
import DownloadsPage from './pages/DownloadsPage';
import WidgetPage from './pages/WidgetPage';
import { useAuthStore } from './store/authStore';

const ProtectedOutlet = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" />;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.role !== 'admin') return <Navigate to="/" />;
  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <AppInitializer>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          {/* Dedicated Offline Mode Route */}
          <Route path="/offline" element={<OfflineLayout />}>
            <Route index element={<DownloadsPage isOfflineMode={true} />} />
          </Route>

          <Route path="/widget" element={<WidgetPage />} />
          <Route path="/widget/:id" element={<WidgetPage />} />
          
          {/* Main Layout Routes (Public & Protected mixed) */}
          <Route element={<Layout />}>
             {/* Public Route (Offline accessible) */}
             <Route path="/downloads" element={<DownloadsPage />} />
             <Route path="/settings" element={<SettingsPage />} />

             {/* Protected Routes */}
             <Route element={<ProtectedOutlet />}>
                <Route index element={<HomePage />} />
                <Route path="bookshelf" element={<BookshelfPage />} />
                <Route path="book/:id" element={<BookDetailPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="favorites" element={<FavoritesPage />} />
                {/* Settings is now public/shared, removed from here */}
                
                <Route path="admin/libraries" element={
                  <AdminRoute>
                    <AdminLibraries />
                  </AdminRoute>
                } />
                <Route path="admin/users" element={
                  <AdminRoute>
                    <AdminUsers />
                  </AdminRoute>
                } />
                <Route path="admin/tasks" element={
                  <AdminRoute>
                    <TaskLogsPage />
                  </AdminRoute>
                } />
             </Route>
          </Route>
        </Routes>
      </AppInitializer>
    </Router>
  );
}

export default App;
