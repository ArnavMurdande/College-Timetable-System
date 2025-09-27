// client/src/pages/LandingPage.jsx

import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useAuth } from '../App'; // Assuming '../App' exports useAuth

// --- Import Assets ---
// These paths are relative to your project structure.
// Make sure they are correct. If these assets are not available
// in this environment, they will not load.
import RAITBackgroundImage from '../assets/images/RAIT.jpg';
import arnavImage from '../assets/images/arnav.jpg';
import tanishkImage from '../assets/images/tanishk.jpg';

// --- Import Carousel Images ---
import aDivOutput from '../assets/images/A div output.png';
import bDivOutput from '../assets/images/B div output.png';
import cDivOutput from '../assets/images/C div output.png';
import dDivOutput from '../assets/images/D div output.png';
import eDivOutput from '../assets/images/E div output.png';
import facultyWise from '../assets/images/FacultyWise.png';
import classroomWise from '../assets/images/ClassroomWise.png';

// --- Import Video ---
import howItWorksVideoFile from '../assets/videos/How to use ScheduleWise.mp4';

const carouselImages = [
  { src: aDivOutput, alt: "Timetable A Division Output" },
  { src: bDivOutput, alt: "Timetable B Division Output" },
  { src: cDivOutput, alt: "Timetable C Division Output" },
  { src: dDivOutput, alt: "Timetable D Division Output" },
  { src: eDivOutput, alt: "Timetable E Division Output" },
  { src: facultyWise, alt: "Faculty-wise Timetable View" },
  { src: classroomWise, alt: "Classroom-wise Timetable View" },
];

// Placeholder for useAuth if not provided by a real App context
const FallbackAuthContext = React.createContext({ isLoggedIn: false, theme: 'light' });
const useAuthFallback = () => React.useContext(FallbackAuthContext);

// Modal Component for Image Preview
const ImagePreviewModal = ({ src, alt, onClose }) => {
  if (!src) return null;

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[100] p-4"
      onClick={onClose} // Close modal when clicking on the backdrop
    >
      <div
        className="relative bg-white dark:bg-gray-900 p-2 rounded-lg shadow-2xl max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()} // Prevent modal close when clicking on modal content
      >
        <img
          src={src}
          alt={alt}
          className="block max-w-full max-h-[calc(90vh-40px)] object-contain rounded"
          // Fallback for image loading error in modal
          onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/800x600/CCCCCC/FFFFFF?text=Preview+Error"; }}
        />
        <button
          onClick={onClose}
          className="absolute top-1 right-1 bg-gray-700 hover:bg-gray-600 text-white p-1.5 rounded-full focus:outline-none z-[101] leading-none"
          aria-label="Close image preview"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};


function LandingPage() {
  // Use actual useAuth if available, otherwise fallback for standalone preview
  const auth = typeof useAuth === 'function' ? useAuth() : useAuthFallback();
  const { isLoggedIn, theme } = auth;

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImageSrc, setModalImageSrc] = useState('');
  const [modalImageAlt, setModalImageAlt] = useState('');

  const [heroRef, heroInView] = useInView({ triggerOnce: true, threshold: 0.1 });
  const [whyUsRef, whyUsInView] = useInView({ triggerOnce: true, threshold: 0.1 });
  const [howItWorksRef, howItWorksInView] = useInView({ triggerOnce: true, threshold: 0.1 });
  const [aboutRef, aboutInView] = useInView({ triggerOnce: true, threshold: 0.1 });

  const overlayOpacityClass = theme === 'dark' ? 'opacity-65' : 'opacity-35';

  const nextImage = () => {
    setCurrentImageIndex((prevIndex) => (prevIndex + 1) % carouselImages.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prevIndex) => (prevIndex - 1 + carouselImages.length) % carouselImages.length);
  };

  const openImageModal = (imageSrc, imageAlt) => {
    setModalImageSrc(imageSrc);
    setModalImageAlt(imageAlt);
    setShowImageModal(true);
  };

  const closeImageModal = () => {
    setShowImageModal(false);
    setModalImageSrc(''); // Clear src when closing
    setModalImageAlt(''); // Clear alt when closing
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      nextImage();
    }, 5000); // Auto-slide every 5 seconds
    return () => clearTimeout(timer); // Cleanup timer on component unmount or re-render
  }, [currentImageIndex]); // Re-run effect when currentImageIndex changes


  // Fallback for imported images if they don't load
  const getSafeImageSrc = (importedSrc, fallbackText = "Image") => {
    // In a real build, Webpack/Vite handles these imports.
    // For a standalone preview, they might be undefined or strings.
    // If it's a string and looks like a path, use it. Otherwise, placeholder.
    if (typeof importedSrc === 'string' && importedSrc.startsWith('../assets')) {
        // This won't actually load in a generic preview, but keeps the structure
        return `https://placehold.co/800x400/EEEEEE/AAAAAA?text=${fallbackText}+Asset`;
    }
    return importedSrc || `https://placehold.co/800x400/EEEEEE/AAAAAA?text=${fallbackText}`;
  }
  
  const safeCarouselImages = carouselImages.map(img => ({
      ...img,
      // Use a generic placeholder if specific images aren't available in this context
      src: img.src || `https://placehold.co/600x400/E0E0E0/757575?text=${encodeURIComponent(img.alt)}`
  }));


  return (
    <div className={`w-full font-sans ${theme === 'dark' ? 'dark' : ''}`}>
      {/* Section 1: Hero Section */}
      <section
        ref={heroRef}
        className="hero-section relative min-h-screen flex items-center justify-center bg-cover bg-center text-white overflow-hidden"
        style={{ backgroundImage: `url(${getSafeImageSrc(RAITBackgroundImage, "RAIT Background")})` }}
      >
        <div className={`absolute inset-0 bg-black ${overlayOpacityClass} z-0 transition-opacity duration-300`}></div>
        <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl w-full py-20 md:py-0">
          <div className="flex flex-col items-center md:flex-row md:items-start gap-12 md:gap-16">
            <div className={`w-full md:w-1/2 text-center md:text-left ${heroInView ? 'animate-fadeInLeft' : 'opacity-0'}`}>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold leading-tight mb-6 sm:mb-8">
                <span className="block">Tired of traditional</span> Excel workbooks?
              </h1>
              <p className="text-lg sm:text-xl lg:text-2xl mb-8 sm:mb-10 opacity-90 max-w-prose mx-auto md:mx-0">
                Manual data entry, complex formulas, and collaboration headaches slow you down. Our system streamlines management, saving you time and reducing errors.
              </p>
              {isLoggedIn ? (
                <NavLink
                  to="/modules"
                  className="inline-block px-8 sm:px-10 py-3 sm:py-4 bg-green-500 hover:bg-green-600 text-white text-lg sm:text-xl font-semibold rounded-lg shadow-lg transform hover:scale-105 transition-all duration-300 ease-in-out"
                >
                  Start Making Timetable
                </NavLink>
              ) : (
                <NavLink
                  to="/login-signup"
                  className="inline-block px-8 sm:px-10 py-3 sm:py-4 bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-lg sm:text-xl font-semibold rounded-lg shadow-lg transform hover:scale-105 transition-all duration-300 ease-in-out"
                >
                  Sign Up / Login
                </NavLink>
              )}
            </div>

            <div className={`w-full md:w-1/2 ${heroInView ? 'animate-slideInRight' : 'opacity-0'} relative group md:pl-8 lg:pl-12`}>
              <div className="relative w-full h-[180px] sm:h-[220px] md:h-[260px] lg:h-[280px] xl:h-[300px] overflow-hidden rounded-3xl shadow-xl cursor-pointer">
                {safeCarouselImages.map((image, index) => (
                  <img
                    key={index}
                    src={image.src} // Use the potentially placeholder src
                    alt={image.alt}
                    className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-700 ease-in-out rounded-3xl ${
                      index === currentImageIndex
                        ? 'opacity-100' // Active image is visible and clickable
                        : 'opacity-0 pointer-events-none' // Inactive images are invisible and NOT clickable
                    }`}
                    onError={(e) => { e.target.onerror = null; e.target.src=`https://placehold.co/600x400/CCCCCC/FFFFFF?text=${encodeURIComponent(image.alt)}+Error`; }}
                    onClick={() => openImageModal(image.src, image.alt)}
                  />
                ))}
                <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex space-x-1.5 z-20">
                  {safeCarouselImages.map((_, index) => (
                    <button
                      key={`dot-${index}`}
                      onClick={() => setCurrentImageIndex(index)}
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${index === currentImageIndex ? 'bg-white scale-110' : 'bg-white/40 hover:bg-white/60'}`}
                      aria-label={`Go to image ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={prevImage}
                className="absolute top-1/2 left-0 md:left-8 lg:left-12 transform -translate-y-1/2 -translate-x-3 sm:-translate-x-4 bg-black/40 hover:bg-black/70 text-white p-2 sm:p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 focus:outline-none z-20"
                aria-label="Previous Image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={nextImage}
                className="absolute top-1/2 right-0 md:right-0 transform -translate-y-1/2 translate-x-3 sm:translate-x-4 bg-black/40 hover:bg-black/70 text-white p-2 sm:p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 focus:outline-none z-20"
                aria-label="Next Image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Why Us? */}
      <section
        ref={whyUsRef}
        className={`py-16 md:py-24 transition-colors duration-300 ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'}`} // Slightly lighter gray for light mode
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl text-center w-full">
          <h2 className={`text-3xl md:text-4xl font-bold mb-12 md:mb-16 ${whyUsInView ? 'animate-fadeInUp' : 'opacity-0'}`}>
            Why Choose ScheduleWise?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {/* Advantage Card 1 */}
            <div className={`p-8 rounded-xl shadow-lg hover:shadow-2xl transform hover:-translate-y-1.5 transition-all duration-300 ease-in-out ${whyUsInView ? 'animate-fadeInUp delay-100' : 'opacity-0'} ${theme === 'dark' ? 'bg-gray-700' : 'bg-white'}`}>
              <div className={`mb-5 mx-auto ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                 </svg>
              </div>
              <h3 className="text-xl md:text-2xl font-semibold mb-3">Streamlined Workflow</h3>
              <p className={`text-base ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                Automate tedious tasks and manage college operations efficiently from a single platform.
              </p>
            </div>
            {/* Advantage Card 2 */}
            <div className={`p-8 rounded-xl shadow-lg hover:shadow-2xl transform hover:-translate-y-1.5 transition-all duration-300 ease-in-out ${whyUsInView ? 'animate-fadeInUp delay-200' : 'opacity-0'} ${theme === 'dark' ? 'bg-gray-700' : 'bg-white'}`}>
              <div className={`mb-5 mx-auto ${theme === 'dark' ? 'text-green-400' : 'text-green-500'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                 <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl md:text-2xl font-semibold mb-3">Data Accuracy</h3>
              <p className={`text-base ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                Reduce human error with validated inputs and centralized data management for reliable insights.
              </p>
            </div>
            {/* Advantage Card 3 */}
            <div className={`p-8 rounded-xl shadow-lg hover:shadow-2xl transform hover:-translate-y-1.5 transition-all duration-300 ease-in-out ${whyUsInView ? 'animate-fadeInUp delay-300' : 'opacity-0'} ${theme === 'dark' ? 'bg-gray-700' : 'bg-white'}`}>
              <div className={`mb-5 mx-auto ${theme === 'dark' ? 'text-purple-400' : 'text-purple-500'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                 <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                </svg>
              </div>
              <h3 className="text-xl md:text-2xl font-semibold mb-3">Easy Access & Collaboration</h3>
              <p className={`text-base ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                Access information securely from anywhere and facilitate seamless collaboration among staff.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: How It Works */}
      <section
        ref={howItWorksRef}
        className={`py-16 md:py-24 transition-colors duration-300 ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl text-center w-full">
          <h2 className={`text-3xl md:text-4xl font-bold mb-12 md:mb-16 ${howItWorksInView ? 'animate-fadeInUp' : 'opacity-0'}`}>
            How It Works
          </h2>
          <div className={`mb-10 ${howItWorksInView ? 'animate-fadeInUp delay-100' : 'opacity-0'}`}>
            <div className="w-full max-w-3xl mx-auto">
              {/* Use placeholder for video if actual file isn't available */}
              <video controls className="rounded-xl shadow-xl w-full h-auto aspect-video" poster="https://placehold.co/1280x720/A5B4FC/1E293B?text=Video+Preview">
                  <source src={typeof howItWorksVideoFile === 'string' && howItWorksVideoFile.startsWith('../assets') ? '#' : howItWorksVideoFile} type="video/mp4" />
                  Your browser does not support the video tag. Consider providing a direct URL or ensuring the asset is bundled.
              </video>
            </div>
          </div>
          <p className={`text-lg md:text-xl max-w-prose mx-auto ${howItWorksInView ? 'animate-fadeInUp delay-200' : 'opacity-0'} ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            Watch this short video to see how ScheduleWise simplifies timetable creation, subject load allocation, and dynamic scheduling. Get started in minutes!
          </p>
        </div>
      </section>

      {/* Section 4: About College and Developers */}
      <section
        ref={aboutRef}
        className={`py-16 md:py-24 transition-colors duration-300 overflow-hidden ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-800'}`} // Slightly lighter gray for light mode
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl w-full">
           <div className="flex flex-col md:flex-row items-center gap-12 md:gap-16">
              <div className={`w-full md:w-1/2 text-center md:text-left ${aboutInView ? 'animate-fadeInLeft' : 'opacity-0'}`}>
                 <h2 className="text-3xl md:text-4xl font-bold mb-8">
                    About Us
                 </h2>
                 <div className={`text-base md:text-lg opacity-90 mb-8 max-w-prose mx-auto md:mx-0 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    <p className="mb-4">
                       Ramrao Adik Institute of Technology (RAIT) is committed to providing a seamless and efficient academic environment. This College Management System is a testament to that commitment, developed by a dedicated team of students.
                    </p>
                    <p className="font-semibold mb-4 text-gray-700 dark:text-gray-200">
                       Developed by:
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-6">
                       <div className="flex flex-col items-center text-center transition-transform duration-300 hover:scale-105">
                          <img src={getSafeImageSrc(arnavImage, "Arnav")} alt="Arnav Murdande" className="w-20 h-20 rounded-full object-cover mb-2 shadow-md border-2 border-gray-300 dark:border-gray-600" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/80x80/CCCCCC/FFFFFF?text=Dev"; }} />
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Arnav Murdande</span>
                       </div>
                       <div className="flex flex-col items-center text-center transition-transform duration-300 hover:scale-105">
                          <img src={getSafeImageSrc(tanishkImage, "Tanishk")} alt="Tanishk Ojha" className="w-20 h-20 rounded-full object-cover mb-2 shadow-md border-2 border-gray-300 dark:border-gray-600" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/80x80/CCCCCC/FFFFFF?text=Dev"; }} />
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Tanishk Ojha</span>
                       </div>
                    </div>
                 </div>
              </div>
              <div className={`w-full md:w-1/2 mt-10 md:mt-0 ${aboutInView ? 'animate-fadeInRight' : 'opacity-0'}`}>
                 <div className="w-full h-[300px] sm:h-[400px] md:h-[450px]">
                    {/* Using a placeholder for the iframe src as the original is not accessible */}
                    <iframe
                       src="https://www.google.com/maps/embed?pb=!1m16!1m12!1m3!1d3486.615257637797!2d73.02297847484608!3d19.0444993321536!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!2m1!1sRAIT!5e1!3m2!1sen!2sin!4v1746831180749!5m2!1sen!2sin"
                       width="100%"
                       height="100%"
                       style={{ border: 0 }}
                       allowFullScreen=""
                       loading="lazy"
                       referrerPolicy="no-referrer-when-downgrade"
                       className="rounded-xl shadow-xl"
                       title="RAIT College Location"
                    ></iframe>
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* Image Preview Modal */}
      {showImageModal && ( // Conditionally render modal
        <ImagePreviewModal
            src={modalImageSrc}
            alt={modalImageAlt}
            onClose={closeImageModal}
        />
      )}

      {/* Animation Styles & Carousel Transition Styles */}
      {/* Ensure Tailwind is setup for these animations or define them */}
      <style>{`
        @keyframes fadeInLeft { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeInRight { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(50%); } to { opacity: 1; transform: translateX(0); } }

        .animate-fadeInLeft { animation: fadeInLeft 0.8s ease-out forwards; }
        .animate-fadeInRight { animation: fadeInRight 0.8s ease-out forwards; }
        .animate-fadeInUp { animation: fadeInUp 0.8s ease-out forwards; }
        .animate-slideInRight { animation: slideInRight 0.8s ease-out forwards; }

        .animate-fadeInUp.delay-100 { animation-delay: 0.1s; }
        .animate-fadeInUp.delay-200 { animation-delay: 0.2s; }
        .animate-fadeInUp.delay-300 { animation-delay: 0.3s; }

        /* Basic dark mode support if not using Tailwind's dark mode prefix extensively */
        body.dark .dark\\:bg-gray-900 { background-color: #111827; }
        body.dark .dark\\:bg-gray-800 { background-color: #1f2937; }
        body.dark .dark\\:text-white { color: #ffffff; }
        body.dark .dark\\:text-gray-200 { color: #e5e7eb; }
        body.dark .dark\\:text-gray-300 { color: #d1d5db; }
        /* Add other dark mode styles as needed */
      `}</style>
    </div>
  );
}

// Fallback App structure for better preview
const App = () => {
  // Example theme state for preview
  const [theme, setTheme] = useState('light'); // 'light' or 'dark'
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Function to toggle theme for preview purposes
  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  const toggleLogin = () => setIsLoggedIn(prev => !prev);


  // This is a mock NavLink for preview purposes as react-router-dom is not fully available here.
  const MockNavLink = ({ to, children, className, ...props }) => (
    <a href={to} className={className} {...props} onClick={(e) => e.preventDefault()}>
      {children}
    </a>
  );
  
  // Replace React Router's NavLink with MockNavLink for preview
  const OriginalNavLink = NavLink;
  React.Fragment.NavLink = MockNavLink; // Temporary override for preview

  // Provide a fallback context value
  const authContextValue = {
    isLoggedIn: isLoggedIn,
    theme: theme,
    // Add any other functions/values your useAuth hook might provide
  };
  
  // Cleanup the NavLink override after rendering
  useEffect(() => {
    return () => {
      React.Fragment.NavLink = OriginalNavLink;
    };
  }, []);

  return (
    <FallbackAuthContext.Provider value={authContextValue}>
      <div className={theme}> {/* Apply theme class to root for dark mode */}
        <div className="p-4 bg-gray-100 dark:bg-gray-800">
            <button onClick={toggleTheme} className="mb-4 mr-2 px-4 py-2 bg-blue-500 text-white rounded">
                Toggle Theme (Preview)
            </button>
            <button onClick={toggleLogin} className="mb-4 px-4 py-2 bg-purple-500 text-white rounded">
                Toggle Login (Preview)
            </button>
        </div>
        <LandingPage />
      </div>
    </FallbackAuthContext.Provider>
  );
};


export default LandingPage;