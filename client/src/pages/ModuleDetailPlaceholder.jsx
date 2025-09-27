// client/src/pages/ModuleDetailPlaceholder.jsx

import React from 'react';
import { useParams, NavLink } from 'react-router-dom'; // Import useParams

function ModuleDetailPlaceholder() {
  // useParams hook extracts parameters from the URL
  // In App.jsx, the route is defined as "/modules/:moduleName"
  // So, the part of the URL after /modules/ will be available as moduleName
  const { moduleName } = useParams();

  // Optional: Format the module name for display (e.g., "room-management" -> "Room Management")
  const formattedModuleName = moduleName
    ? moduleName.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
    : 'Unknown Module'; // Fallback if moduleName is undefined

  return (
    <div className="container mx-auto p-8 text-center">
      <h1 className="text-3xl md:text-4xl font-bold mb-4 text-gray-800 dark:text-white">
        {formattedModuleName}
      </h1>
      <p className="text-lg text-gray-600 dark:text-gray-300">
        This is the placeholder page for the {formattedModuleName} module.
        The actual content and functionality for managing {formattedModuleName} will be built here.
      </p>
      {/* Example: Link back to the Modules page */}
      <NavLink
        to="/modules"
        className="mt-6 inline-block px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
      >
        Back to Modules
      </NavLink>
    </div>
  );
}

export default ModuleDetailPlaceholder;
