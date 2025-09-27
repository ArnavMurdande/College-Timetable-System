/** @type {import('tailwindcss').Config} */
export default {
  // This array tells Tailwind which files to scan for class names
  content: [
    "./index.html", // Include the main HTML file
    "./src/**/*.{js,ts,jsx,tsx}", // Include all JS/TS/JSX files in the src folder
  ],

  // Configure dark mode to be based on the presence of a 'dark' class
  // on an ancestor element (like the <html> or <body> tag).
  darkMode: 'class',

  theme: {
    extend: {
      fontFamily: {
        // Optional: Add 'Inter' font if desired (requires linking in index.html)
        // You can then use the 'font-sans' class to apply this font.
        sans: ['Inter', 'sans-serif'],
      },
      // You can extend other theme properties here (colors, spacing, etc.)
    },
  },

  // Add any Tailwind plugins here
  plugins: [],
}

