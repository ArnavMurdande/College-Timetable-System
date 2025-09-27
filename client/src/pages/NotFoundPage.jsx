// client/src/pages/NotFoundPage.jsx

import React from 'react';
import { NavLink } from 'react-router-dom'; // Import NavLink for the "Go Home" button

function NotFoundPage() {
  return (
    <div className="container mx-auto p-8 text-center">
      <h1 className="text-4xl font-bold mb-4 text-gray-700 dark:text-gray-300">404 - Not Found</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">Sorry, the page you are looking for does not exist or you don't have the permission to access the page please ask the admin for access.</p>
      <NavLink
        to="/" // Link back to the home page
        className="inline-block px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
      >
        Go Home
      </NavLink>
    </div>
  );
}

export default NotFoundPage; // Export the component as default
