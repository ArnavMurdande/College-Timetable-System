// client/src/components/Navbar.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import dypatilLogo from '../assets/images/dy-patil-logo.png'; 
import { useAuth } from '../App';
import axios from 'axios'; 

const API_BASE_URL = 'http://localhost:5001/api'; 

const ROLES = {
    ADMIN: 'Admin',
    FACULTY: 'Faculty',
    USER: 'User',
    LOGGED_OUT: null,
};

function Navbar() {
  const { isLoggedIn, userInfo, handleLogout, theme, toggleTheme } = useAuth();
  const [isHamburgerMenuOpen, setIsHamburgerMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false); 
  const [upcomingReminders, setUpcomingReminders] = useState([]); 
  const [hasUnreadReminders, setHasUnreadReminders] = useState(false); 

  const hamburgerButtonRef = useRef(null);
  const hamburgerDropdownRef = useRef(null);
  const profileButtonRef = useRef(null);
  const profileDropdownRef = useRef(null);
  const notificationButtonRef = useRef(null); 
  const notificationDropdownRef = useRef(null); 

  const navigate = useNavigate();

  const navLinksConfig = [
    { name: "Home", path: "/", roles: [ROLES.ADMIN, ROLES.FACULTY, ROLES.USER, ROLES.LOGGED_OUT], type: 'base' },
    { name: "Modules", path: "/modules", roles: [ROLES.ADMIN, ROLES.FACULTY, ROLES.LOGGED_OUT], type: 'base', requiresLogin: true },
    { name: "Modules", path: "/dashboard", roles: [ROLES.USER], type: 'base', requiresLogin: true }, 
    { name: "Admin Panel", path: "/admin", roles: [ROLES.ADMIN], type: 'extra' }, 
    { name: "Manage Profile", path: "/profile/manage", roles: [ROLES.ADMIN, ROLES.FACULTY, ROLES.USER], type: 'extra' },
  ];

  const getVisibleLinks = (context) => {
    const currentRole = isLoggedIn ? userInfo?.role : ROLES.LOGGED_OUT;
    return navLinksConfig.filter(link => {
        if (!link.roles.includes(currentRole)) return false;
        if (context === 'hamburger_main') return link.type === 'base'; 
        if (context === 'profile_dropdown_desktop') return link.type === 'extra'; 
        if (context === 'hamburger_extras_mobile' && isLoggedIn) return link.type === 'extra'; 
        return false;
    });
  };

  const hamburgerMainLinks = getVisibleLinks('hamburger_main');
  const profileDesktopLinks = getVisibleLinks('profile_dropdown_desktop');
  const hamburgerMobileExtras = getVisibleLinks('hamburger_extras_mobile');

  const fetchUserReminders = useCallback(async () => {
    if (!isLoggedIn || !userInfo?.id) {
        setUpcomingReminders([]);
        setHasUnreadReminders(false);
        return;
    }
    const token = localStorage.getItem('authToken');
    if (!token) {
        // console.log("Navbar: No auth token for reminders.");
        return;
    }
    try {
        // console.log("Navbar: Fetching reminders...");
        const response = await axios.get(`${API_BASE_URL}/events/my-reminders`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        const serverReminders = response.data || [];
        // console.log("Navbar: Raw reminders from server:", JSON.stringify(serverReminders, null, 2));

        const clientNow = new Date();
        // console.log("Navbar: Client 'now' (local):", clientNow.toLocaleString(), `(UTC: ${clientNow.toISOString()})`);

        const filteredReminders = serverReminders
            .filter(event => {
                const reminderTime = event.reminderDateTime ? new Date(event.reminderDateTime) : null;
                const isUpcoming = event.reminderEnabled && reminderTime && reminderTime > clientNow; 
                return isUpcoming;
            })
            .sort((a, b) => new Date(a.reminderDateTime) - new Date(b.reminderDateTime));

        // console.log("Navbar: Filtered upcoming reminders on client:", JSON.stringify(filteredReminders.map(r => ({id: r.id, title: r.title, reminderTime: r.reminderDateTime})), null, 2));

        setUpcomingReminders(prevUpcomingReminders => {
            const newTop5Reminders = filteredReminders.slice(0, 5);
            const newIds = new Set(newTop5Reminders.map(r => r.id));
            const oldIds = new Set(prevUpcomingReminders.map(r => r.id));
            let trulyNewUnseen = false;

            if (newTop5Reminders.length > 0) {
                for (const id of newIds) {
                    if (!oldIds.has(id)) {
                        trulyNewUnseen = true;
                        break;
                    }
                }
                if (prevUpcomingReminders.length === 0 && newTop5Reminders.length > 0) {
                    trulyNewUnseen = true;
                }
                if (!trulyNewUnseen && JSON.stringify(newTop5Reminders.map(r=>r.id)) !== JSON.stringify(prevUpcomingReminders.map(r=>r.id))) {
                    trulyNewUnseen = true;
                }
            }
            
            if (trulyNewUnseen) {
                // console.log("Navbar: New unread reminders detected. Setting hasUnreadReminders to true.");
                setHasUnreadReminders(true);
            } else if (newTop5Reminders.length === 0 && prevUpcomingReminders.length > 0) {
                 setHasUnreadReminders(false);
            }
            return newTop5Reminders;
        });

    } catch (err) {
        console.error("Navbar: Failed to fetch reminders:", err.response || err);
        setUpcomingReminders([]);
    }
  }, [isLoggedIn, userInfo?.id]); 

  useEffect(() => {
    if (isLoggedIn && userInfo?.id) { 
        fetchUserReminders(); 
        const intervalId = setInterval(fetchUserReminders, 60000 * 1); 
        return () => clearInterval(intervalId);
    } else {
        setUpcomingReminders([]); 
        setHasUnreadReminders(false);
    }
  }, [isLoggedIn, userInfo?.id, fetchUserReminders]);


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isHamburgerMenuOpen && hamburgerButtonRef.current && !hamburgerButtonRef.current.contains(event.target) && hamburgerDropdownRef.current && !hamburgerDropdownRef.current.contains(event.target)) {
        setIsHamburgerMenuOpen(false);
      }
      if (isProfileMenuOpen && profileButtonRef.current && !profileButtonRef.current.contains(event.target) && profileDropdownRef.current && !profileDropdownRef.current.contains(event.target)) {
        setIsProfileMenuOpen(false);
      }
      if (isNotificationOpen && notificationButtonRef.current && !notificationButtonRef.current.contains(event.target) && notificationDropdownRef.current && !notificationDropdownRef.current.contains(event.target)) {
        setIsNotificationOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isHamburgerMenuOpen, isProfileMenuOpen, isNotificationOpen]);

  const toggleHamburgerMenu = () => { setIsHamburgerMenuOpen(prev => !prev); setIsProfileMenuOpen(false); setIsNotificationOpen(false); };
  const toggleProfileMenu = () => { setIsProfileMenuOpen(prev => !prev); setIsHamburgerMenuOpen(false); setIsNotificationOpen(false); };
  const toggleNotificationMenu = () => { 
    const opening = !isNotificationOpen;
    setIsNotificationOpen(opening); 
    setIsHamburgerMenuOpen(false); 
    setIsProfileMenuOpen(false);
    if (opening) { 
        // console.log("Navbar: Notification menu opened, clearing unread flag.");
        setHasUnreadReminders(false);
    }
  };

  const closeAllMenus = () => { setIsHamburgerMenuOpen(false); setIsProfileMenuOpen(false); setIsNotificationOpen(false);};

  const onLinkClick = (path, requiresLogin = false) => {
    if (requiresLogin && !isLoggedIn) {
        closeAllMenus();
        navigate('/login-signup', { state: { from: { pathname: path } } });
        return false;
    }
    closeAllMenus();
    return true;
  };

  const onLogoutClick = () => {
    handleLogout(); closeAllMenus(); navigate('/');
  };

  const dropdownLinkClass = "block px-4 py-3 text-base text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors w-full text-left rounded-md";
  const dropdownButtonClass = "block px-4 py-3 text-base text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors w-full text-left rounded-md";
  // MODIFIED: Increased text size for notificationItemClass and details within it
  const notificationItemClass = "block px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors";


  return (
    <nav className="relative bg-[#941c34] text-white shadow-lg sticky top-0 z-50 print:hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18 md:h-20">
          <NavLink to="/" onClick={() => onLinkClick("/")} className="flex items-center space-x-3 sm:space-x-4 group flex-shrink-0">
            <img src={dypatilLogo} alt="DY Patil Logo" className="block h-16 w-30 sm:h-40" onError={(e) => { e.target.style.display = 'none'; }} />
            <span className="text-xl sm:text-2xl md:text-3xl font-semibold" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.5)' }}>ScheduleWise</span>
          </NavLink>

          <div className="flex items-center space-x-2 sm:space-x-3"> 
            <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#941c34] focus:ring-white transition-colors" aria-label="Toggle Theme">
              {theme === 'light' ? ( <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg> ) : ( <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg> )}
            </button>

            {isLoggedIn && (
                <div className="relative">
                    <button 
                        ref={notificationButtonRef} 
                        onClick={toggleNotificationMenu} 
                        className={`p-2 rounded-full hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#941c34] focus:ring-white transition-colors ${hasUnreadReminders ? 'animate-shake' : ''}`} 
                        aria-label="Notifications"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {upcomingReminders.length > 0 && (
                            <span className="absolute top-0 right-0 block h-2.5 w-2.5 sm:h-3 sm:w-3 transform -translate-y-1/2 translate-x-1/2 rounded-full ring-1 sm:ring-2 ring-white bg-red-500"></span>
                        )}
                    </button>
                    {isNotificationOpen && (
                        <div ref={notificationDropdownRef} className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] overflow-y-auto rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50 origin-top-right animate-scaleIn">
                            <div className="px-4 py-3 text-base font-semibold text-gray-800 dark:text-gray-100 border-b dark:border-gray-700"> {/* MODIFIED: Increased text size */}
                                Event Reminders ({upcomingReminders.length})
                            </div>
                            {upcomingReminders.length > 0 ? (
                                upcomingReminders.map(event => (
                                    <div key={event.id} className={`${notificationItemClass} border-b dark:border-gray-700 last:border-b-0`}>
                                        <p className="font-semibold text-gray-800 dark:text-gray-100 truncate" title={event.title}>{event.title}</p> {/* MODIFIED: Increased text size implicitly by notificationItemClass */}
                                        <p className="text-sm text-gray-600 dark:text-gray-300"> {/* MODIFIED: Increased text size */}
                                            Reminder: {new Date(event.reminderDateTime).toLocaleString()}
                                        </p>
                                        {event.eventTimings && event.eventTimings.length > 0 && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400"> {/* MODIFIED: Base text size sm, this becomes slightly smaller */}
                                                Event Time: {event.eventTimings[0].dayOfWeek}, {event.eventTimings[0].startTime}
                                                {event.eventTimings[0].specificDate ? ` (${new Date(event.eventTimings[0].specificDate).toLocaleDateString()})` : ''}
                                            </p>
                                        )}
                                        {event.assignedRooms && event.assignedRooms.length > 0 && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400"> {/* MODIFIED: Base text size sm, this becomes slightly smaller */}
                                                Room(s): {event.assignedRooms.map(r => r.roomNumber).join(', ')}
                                            </p>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No upcoming reminders.</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {isLoggedIn ? (
              <div className="relative hidden md:block"> 
                <button ref={profileButtonRef} onClick={toggleProfileMenu} className="p-1 rounded-full hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#941c34] focus:ring-white" aria-label="User Profile Menu">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 sm:h-8 sm:w-8" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a4 4 0 00-4 4h8a4 4 0 00-4-4z" clipRule="evenodd" /></svg>
                </button>
                {isProfileMenuOpen && (
                    <div ref={profileDropdownRef} className="absolute right-0 mt-2 w-56 rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50 origin-top-right animate-scaleIn">
                        {profileDesktopLinks.map(link => (
                             <NavLink key={link.path} to={link.path} className={dropdownLinkClass} onClick={() => onLinkClick(link.path, link.requiresLogin)}>{link.name}</NavLink>
                        ))}
                        <button onClick={onLogoutClick} className={dropdownButtonClass}>Logout</button>
                    </div>
                 )}
              </div>
            ) : (
              <NavLink to="/login-signup" className="hidden md:inline-block px-3 py-2 sm:px-4 sm:py-2.5 rounded-md text-sm sm:text-base font-medium hover:bg-white/20 transition-colors" onClick={() => onLinkClick("/login-signup")}>
                Sign Up / Login
              </NavLink>
            )}

            <div className="flex items-center"> 
              <button ref={hamburgerButtonRef} onClick={toggleHamburgerMenu} className="p-2 rounded-md hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#941c34] focus:ring-white" aria-label="Open main menu">
                {isHamburgerMenuOpen ? ( <svg className="block h-6 w-6 sm:h-7 sm:w-7" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg> ) : ( <svg className="block h-6 w-6 sm:h-7 sm:w-7" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg> )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {isHamburgerMenuOpen && (
        <div ref={hamburgerDropdownRef} className="absolute right-4 sm:right-6 lg:right-8 mt-1 w-64 sm:w-72 max-w-[90vw] rounded-md shadow-lg py-2 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50 origin-top-right animate-scaleIn">
          <div className="px-2 space-y-1"> 
              {hamburgerMainLinks.map((link) => (
                <NavLink
                    key={`${link.path}-${link.requiresLogin ? 'loginreq' : 'no'}`}
                    to={link.path}
                    className={dropdownLinkClass}
                    onClick={(e) => { if (!onLinkClick(link.path, link.requiresLogin)) e.preventDefault(); }}
                >
                  {link.name}
                </NavLink>
              ))}
          </div>

          {isLoggedIn && (
            <div className="md:hidden pt-2 pb-1 mt-2 border-t border-gray-200 dark:border-gray-700 px-2 space-y-1">
                {hamburgerMobileExtras.map(link => (
                    <NavLink key={link.path + "-mobile-extra"} to={link.path} className={dropdownLinkClass} onClick={() => onLinkClick(link.path, link.requiresLogin)}>
                        {link.name}
                    </NavLink>
                ))}
            </div>
          )}
          
          <div className="md:hidden pt-2 pb-1 mt-2 border-t border-gray-200 dark:border-gray-700 px-2">
            {isLoggedIn ? (
                <button onClick={onLogoutClick} className={dropdownButtonClass}>Logout</button>
            ) : (
                <NavLink to="/login-signup" className="block w-full text-center bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-4 rounded-md text-sm transition duration-150 ease-in-out" onClick={() => onLinkClick("/login-signup")}>
                    Sign Up / Login
                </NavLink>
            )}
          </div>
        </div>
      )}
      <style jsx>{`
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-scaleIn { animation: scaleIn 0.1s ease-out forwards; }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); } 
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }
        .animate-shake {
          animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }
        /* Removed .text-xxs as base size is increased */
      `}</style>
    </nav>
  );
}

export default Navbar;
