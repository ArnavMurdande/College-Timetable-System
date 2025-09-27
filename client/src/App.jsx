// File: client/src/App.jsx

import React, { useState, useEffect, useCallback, useContext } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation, NavLink } from 'react-router-dom';

// Import Components
import Navbar from './components/Navbar';

// Import Pages
import LandingPage from './pages/Landingpage';
import LoginSignupPage from './pages/LoginSignupPage';
import ModulesPage from './pages/ModulesPage';
import ModuleDetailPlaceholder from './pages/ModuleDetailPlaceholder';
import NotFoundPage from './pages/NotFoundPage';
import ProfileManagePage from './pages/ProfileManagePage';
import AdminPage from './pages/AdminPage.jsx'; // Ensure .jsx if it is
import RoomManagementPage from './pages/RoomManagementPage.jsx';
import SubjectManagementPage from './pages/SubjectManagementPage.jsx';
import FacultyManagementPage from './pages/FacultyManagementPage.jsx';
import SyllabusManagementPage from './pages/SyllabusManagementPage.jsx';
import DivisionBatchManagementPage from './pages/DivisionBatchManagementPage.jsx';
import StudentElectiveChoicePage from './pages/StudentElectiveChoicePage.jsx';
import LoadAllocationPage from './pages/LoadAllocationPage.jsx';
import LoadCalculationPage from './pages/LoadCalculationPage.jsx';
import TimetableManagementPage from './pages/TimetableManagementPage.jsx';
import EventSchedulingPage from './pages/EventSchedulingPage.jsx';

// Import Context Providers
import { DepartmentProvider } from './context/DepartmentContext';

import './index.css'; // Global styles

// --- Authentication Context ---
const AuthContext = React.createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

// --- Main App Component ---
function App() {
  return (
    <AuthProvider>
      <DepartmentProvider>
        <Router>
          <AppContent />
        </Router>
      </DepartmentProvider>
    </AuthProvider>
  );
}

// --- AuthProvider Component (manages auth state and theme) ---
function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return savedTheme || (prefersDark ? 'dark' : 'light');
  });

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const checkAuthStatus = useCallback(() => {
    const token = localStorage.getItem('authToken');
    const expiry = localStorage.getItem('tokenExpiry');
    const storedUserInfo = localStorage.getItem('userInfo');
    let loggedIn = false;
    let info = null;
    if (token && expiry && Date.now() < parseInt(expiry, 10)) {
      if (storedUserInfo) {
        try { info = JSON.parse(storedUserInfo); loggedIn = true; }
        catch (e) { console.error("Auth: Error parsing stored user info:", e); localStorage.clear(); }
      } else { localStorage.clear(); }
    } else { if (token || expiry || storedUserInfo) localStorage.clear(); }
    setUserInfo(info); setIsLoggedIn(loggedIn); setAuthChecked(true);
  }, []);

  useEffect(() => { checkAuthStatus(); }, [checkAuthStatus]);

  const handleLoginSuccess = useCallback((userData, token, expiresIn) => {
    localStorage.setItem('authToken', token);
    localStorage.setItem('userInfo', JSON.stringify(userData));
    let expiresInMs = 24 * 60 * 60 * 1000; // Default 24 hours
    if (typeof expiresIn === 'number') {
        expiresInMs = expiresIn; 
    } else if (typeof expiresIn === 'string') {
        const unit = expiresIn.slice(-1);
        const value = parseInt(expiresIn.slice(0, -1));
        if (!isNaN(value)) {
            if (unit === 'd') expiresInMs = value * 24 * 60 * 60 * 1000;
            else if (unit === 'h') expiresInMs = value * 60 * 60 * 1000;
            else if (unit === 'm') expiresInMs = value * 60 * 1000;
            else if (unit === 's') expiresInMs = value * 1000;
        }
    }
    localStorage.setItem('tokenExpiry', (Date.now() + expiresInMs).toString());
    setUserInfo(userData); setIsLoggedIn(true);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.clear();
    setIsLoggedIn(false);
    setUserInfo(null);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  }, []);

  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.storageArea === localStorage && (event.key === 'authToken' || event.key === 'userInfo' || event.key === 'tokenExpiry' || event.key === null)) {
        checkAuthStatus();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [checkAuthStatus]);

  const authContextValue = { isLoggedIn, userInfo, authChecked, theme, handleLoginSuccess, handleLogout, toggleTheme, checkAuthStatus };

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-white">Initializing Application...</div>;
  }
  return <AuthContext.Provider value={authContextValue}>{children}</AuthContext.Provider>;
}

// --- AppContent Component (handles layout and routing) ---
function AppContent() {
    const { isLoggedIn, userInfo, theme, authChecked } = useAuth();
    const location = useLocation();

    const ProtectedRoute = ({ element, allowedRoles }) => {
        const { isLoggedIn: currentIsLoggedIn, userInfo: currentUserInfo, authChecked: currentAuthChecked } = useAuth();
        const currentPath = useLocation().pathname;

        if (!currentAuthChecked) {
            return <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-white">Verifying access...</div>;
        }
        if (!currentIsLoggedIn) {
            return <Navigate to="/login-signup" state={{ from: currentPath }} replace />;
        }
        if (currentUserInfo?.role === 'User') {
            if (currentUserInfo.isPending) {
                if (currentPath === '/dashboard' || currentPath === '/profile/manage') return element;
                return <Navigate to="/dashboard" replace />;
            } else {
                // If user is not pending but still 'User' role, restrict access to non-dashboard/profile pages
                if (currentPath === '/dashboard' || currentPath === '/profile/manage') return element;
                return <Navigate to="/404" replace />; // Or a specific "Access Denied" page for Users
            }
        }
        // For Admin and Faculty
        if (allowedRoles && !allowedRoles.includes(currentUserInfo?.role)) {
            return <Navigate to="/404" replace />; // Or a more specific "Access Denied" page
        }
        return element;
    };

    const PendingApproval = () => (
        <div className="text-center p-6 sm:p-8 mt-10 max-w-md mx-auto bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-700 rounded-lg shadow-md text-yellow-700 dark:text-yellow-200">
            <h2 className="text-xl font-semibold mb-3">Account Pending Approval</h2>
            <p className="text-sm sm:text-base">Your account requires administrator approval. Please contact your college administrator to gain full access.</p>
            <NavLink to="/" className="mt-4 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium">Return to Homepage</NavLink>
        </div>
    );

    const UserDashboard = () => {
        const { userInfo: currentUserInfo } = useAuth();
        if (!currentUserInfo) return null;

        if (currentUserInfo.isPending === true && currentUserInfo.role === 'User') {
            return <PendingApproval />;
        }
        // For Admin and Faculty, or approved Users
        return (
             <div className="text-center p-6 sm:p-8 mt-10">
                 <h2 className="text-2xl font-semibold mb-3 text-gray-800 dark:text-white">Welcome, {currentUserInfo.email}!</h2>
                 <p className="text-gray-700 dark:text-gray-300">
                    {currentUserInfo.role === 'Admin' || currentUserInfo.role === 'Faculty'
                        ? "You can start managing college data or proceed to modules."
                        : "Your account is active. You can manage your profile."}
                 </p>
                 {(currentUserInfo.role === 'Admin' || currentUserInfo.role === 'Faculty') && (
                    <NavLink to="/modules" className="mt-4 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium">
                        Go to Modules
                    </NavLink>
                 )}
             </div>
        );
    };

    if (!authChecked) return <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-white">Loading Application State...</div>;

    const mainContentPadding = location.pathname === '/' ? 'pt-0' : 'py-6 sm:py-8';

    return (
        <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${theme === 'dark' ? 'bg-gray-900 text-gray-50' : 'bg-gray-100 text-gray-900'}`}>
            <Navbar />
            <main className={`flex-grow w-full ${mainContentPadding} ${location.pathname !== '/' ? 'container mx-auto px-4 sm:px-6 lg:px-8' : ''}`}>
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login-signup" element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <LoginSignupPage />} />

                    <Route path="/dashboard" element={isLoggedIn ? <UserDashboard /> : <Navigate to="/login-signup" state={{ from: location }} replace />} />
                    <Route path="/profile/manage" element={isLoggedIn ? <ProfileManagePage /> : <Navigate to="/login-signup" state={{ from: location }} replace />} />

                    {/* Admin and Faculty Modules */}
                    <Route path="/modules" element={<ProtectedRoute element={<ModulesPage />} allowedRoles={['Admin', 'Faculty']} />} />
                    <Route path="/modules/room-management" element={<ProtectedRoute element={<RoomManagementPage />} allowedRoles={['Admin', 'Faculty']} />} />
                    <Route path="/modules/subject-management" element={<ProtectedRoute element={<SubjectManagementPage />} allowedRoles={['Admin', 'Faculty']} />} />
                    <Route path="/modules/faculty-management" element={<ProtectedRoute element={<FacultyManagementPage />} allowedRoles={['Admin', 'Faculty']} />} />
                    <Route path="/modules/syllabus-management" element={<ProtectedRoute element={<SyllabusManagementPage />} allowedRoles={['Admin', 'Faculty']} />} />
                    <Route path="/modules/division-batch-management" element={<ProtectedRoute element={<DivisionBatchManagementPage />} allowedRoles={['Admin', 'Faculty']} />} />
                    <Route path="/modules/student-elective-choices" element={<ProtectedRoute element={<StudentElectiveChoicePage />} allowedRoles={['Admin', 'Faculty']} />} />
                    <Route path="/modules/load-allocation" element={<ProtectedRoute element={<LoadAllocationPage />} allowedRoles={['Admin', 'Faculty']} />} />
                    <Route path="/modules/load-calculation" element={<ProtectedRoute element={<LoadCalculationPage />} allowedRoles={['Admin', 'Faculty']} />} />
                    
                    {/* MODIFIED: Timetable Management now Admin only */}
                    <Route path="/modules/timetable-management" element={<ProtectedRoute element={<TimetableManagementPage />} allowedRoles={['Admin']} />} /> 
                    
                    <Route path="/modules/scheduling-events" element={<ProtectedRoute element={<EventSchedulingPage />} allowedRoles={['Admin', 'Faculty']} />} />


                    {/* Placeholder for other modules */}
                    <Route path="/modules/:moduleName" element={<ProtectedRoute element={<ModuleDetailPlaceholder />} allowedRoles={['Admin', 'Faculty']} />} />

                    {/* Admin-specific routes */}
                    <Route path="/admin" element={<ProtectedRoute element={<AdminPage />} allowedRoles={['Admin']} />} />

                    <Route path="/404" element={<NotFoundPage />} />
                    <Route path="*" element={<Navigate to="/404" replace />} />
                </Routes>
            </main>
            <footer className="bg-[#941c34] text-white text-center p-4 text-xs sm:text-sm mt-auto print:hidden">
                © {new Date().getFullYear()} ScheduleWise by RAIT. All Rights Reserved.
            </footer>
        </div>
    );
}

export default App;
