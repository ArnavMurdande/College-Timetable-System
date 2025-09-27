// Step 4.11: Update the main entry point
// Open 'client/src/main.jsx'. Ensure it looks like this:

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx' // Import the main App component
import './index.css' // Make sure Tailwind styles are imported here

// Find the root element in index.html and create a React root
ReactDOM.createRoot(document.getElementById('root')).render(
  // Use React.StrictMode for development checks
  <React.StrictMode>
    {/* Render the main App component */}
    <App />
  </React.StrictMode>,
)