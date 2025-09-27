// File: client/src/pages/RoomManagementPage.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../App';
import { useDepartment } from '../context/DepartmentContext';
import Papa from 'papaparse';
import * as XLSX from 'xlsx'; // Added for Excel export

const API_BASE_URL = 'http://localhost:5001/api';
const ROOM_CATEGORIES = ['Lecture', 'Lab', 'Auditorium Hall']; // Keep in sync with backend

function RoomManagementPage() {
  const { userInfo } = useAuth();
  const { departments, selectedDepartment, isLoadingDepartments: isLoadingDeptsForFilter } = useDepartment();

  const [rooms, setRooms] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(''); // General error for form/delete actions
  const [fileError, setFileError] = useState(''); // Specific error for file uploads
  const [successMessage, setSuccessMessage] = useState(''); // For general success messages

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomNumber, setRoomNumber] = useState('');
  const [category, setCategory] = useState('');
  const [floor, setFloor] = useState('');
  const [capacity, setCapacity] = useState('');
  const [features, setFeatures] = useState('');
  const [roomDepartmentId, setRoomDepartmentId] = useState(''); // For form's department selection

  // Filter State (local to this page)
  const [filterCategory, setFilterCategory] = useState('');
  const [filterFloor, setFilterFloor] = useState('');
  const [filterMinCapacity, setFilterMinCapacity] = useState('');
  const [filterFeatures, setFilterFeatures] = useState('');

  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  const isAdmin = userInfo?.role === 'Admin';

  // Function to fetch rooms based on current filters and selected department
  const fetchRooms = useCallback(async () => {
    setIsLoading(true);
    setError('');
    setSuccessMessage(''); // Clear success message on new fetch
    const token = localStorage.getItem('authToken');

    if (!token) {
      setError('Authentication token not found. Please log in.');
      setIsLoading(false);
      return;
    }

    const params = new URLSearchParams();
    if (filterCategory) params.append('category', filterCategory);
    if (filterFloor) params.append('floor', filterFloor);
    if (filterMinCapacity) params.append('minCapacity', filterMinCapacity);
    const featuresToFilter = filterFeatures.split(',').map(f => f.trim()).filter(f => f);
    if (featuresToFilter.length > 0) params.append('features', featuresToFilter.join(','));

    // If a global department is selected, use it for filtering.
    // Otherwise, the backend will fetch rooms from all departments or unassigned ones
    // based on other filters. The backend already handles departmentId=null for unassigned.
    if (selectedDepartment) {
      params.append('departmentId', selectedDepartment.id);
    }
    
    try {
      const url = `${API_BASE_URL}/rooms${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setRooms(response.data || []);
    } catch (err) {
      console.error("Fetch Rooms Error:", err);
      setError(err.response?.data?.message || 'Failed to fetch rooms.');
       if (err.response?.status === 401 || err.response?.status === 403) {
           setError('You are not authorized to view rooms.');
       }
    } finally {
      setIsLoading(false);
    }
  }, [filterCategory, filterFloor, filterMinCapacity, filterFeatures, selectedDepartment, userInfo]); // Added userInfo to dependencies

  useEffect(() => {
    if (userInfo) { // Ensure userInfo is loaded before fetching
        fetchRooms();
    }
  }, [fetchRooms, userInfo]); // Re-fetch if fetchRooms or userInfo changes

  const resetForm = () => {
      setRoomNumber('');
      setCategory(ROOM_CATEGORIES[0] || ''); // Default to the first category or empty
      setFloor('');
      setCapacity('');
      setFeatures('');
      setRoomDepartmentId(''); // Reset department selection in form
      setCurrentRoom(null);
      setIsEditMode(false);
      setError(''); // Clear form-specific error
      setSuccessMessage(''); // Clear success message on form reset
  };

  const handleShowAddForm = () => {
      resetForm();
      setShowForm(true);
  };

  const handleShowEditForm = (room) => {
      resetForm();
      setIsEditMode(true);
      setCurrentRoom(room);
      setRoomNumber(room.roomNumber);
      setCategory(room.category);
      setFloor(String(room.floor));
      setCapacity(String(room.capacity));
      setFeatures(Array.isArray(room.features) ? room.features.join(', ') : '');
      setRoomDepartmentId(room.departmentId ? String(room.departmentId) : ''); // Set department for edit
      setShowForm(true);
  };

  const handleCancelForm = () => {
      setShowForm(false);
      resetForm();
  };

  const handleSubmitRoom = async (e) => {
     e.preventDefault();
     setError(''); 
     setSuccessMessage('');
     const token = localStorage.getItem('authToken');
     if (!token || !isAdmin) { setError('You are not authorized for this action.'); return; }

     // Basic Validations
     const floorNum = parseInt(floor);
     const capacityNum = parseInt(capacity);
     if (isNaN(floorNum) || floorNum < 0) { setError("Floor must be a non-negative number."); return; }
     if (isNaN(capacityNum) || capacityNum < 0) { setError("Capacity must be a non-negative number."); return; }
     if (!roomNumber.trim()) { setError("Room Number is required."); return; }
     if (!category.trim()) { setError("Category is required."); return; }
     if (!ROOM_CATEGORIES.includes(category)) { setError("Please select a valid category."); return; }

     setIsSubmitting(true);
     const featuresArray = features.split(',').map(f => f.trim()).filter(f => f);
     const roomPayload = {
         roomNumber: roomNumber.trim(), category: category.trim(),
         floor: floorNum, capacity: capacityNum, features: featuresArray,
         departmentId: roomDepartmentId ? parseInt(roomDepartmentId) : null, // Send null if unassigned
     };

     const url = isEditMode ? `${API_BASE_URL}/rooms/${currentRoom.id}` : `${API_BASE_URL}/rooms`;
     const method = isEditMode ? 'put' : 'post';

     try {
       await axios[method](url, roomPayload, { headers: { 'Authorization': `Bearer ${token}` } });
       setSuccessMessage(`Room ${isEditMode ? 'updated' : 'added'} successfully!`);
       handleCancelForm();
       fetchRooms(); // Refresh the list
     } catch (err) {
       console.error(`${isEditMode ? 'Update' : 'Add'} Room Error:`, err);
       setError(err.response?.data?.message || `Failed to ${isEditMode ? 'update' : 'add'} room.`);
     } finally {
       setIsSubmitting(false);
     }
  };

  const handleDeleteRoom = async (roomId, roomNum) => {
    setError(''); 
    setSuccessMessage('');
    const token = localStorage.getItem('authToken');
    if (!token || !isAdmin) { setError('You are not authorized for this action.'); return; }
    if (!window.confirm(`Are you sure you want to delete room "${roomNum}" (ID: ${roomId})? This action cannot be undone.`)) return;

    setIsSubmitting(true); // Use general submitting state for delete as well
    try {
        await axios.delete(`${API_BASE_URL}/rooms/${roomId}`, { headers: { 'Authorization': `Bearer ${token}` } });
        setSuccessMessage('Room deleted successfully!');
        fetchRooms(); // Refresh list
    } catch (err) {
        console.error("Delete Room Error:", err);
        setError(err.response?.data?.message || 'Failed to delete room.');
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleResetFilters = () => {
      setFilterCategory(''); setFilterFloor('');
      setFilterMinCapacity(''); setFilterFeatures('');
      // Note: Global department filter (selectedDepartment) is managed by DepartmentContext
      // and is not reset here. fetchRooms will use it if set.
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileError(''); 
    setSuccessMessage('');
    setIsUploading(true);
    const token = localStorage.getItem('authToken');

    if (!token || !isAdmin) {
      setFileError('You are not authorized for this action.');
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const requiredBaseHeaders = ["Room No.", "Category", "Floor", "Capacity"]; // Headers in the file

    try {
      let parsedData = [];
      if (file.name.endsWith('.csv')) {
        parsedData = await new Promise((resolve, reject) => {
          Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: (results) => {
              if (results.errors.length) return reject(new Error(results.errors.map(err => err.message).join(", ")));
              const headers = results.meta.fields;
              if (!requiredBaseHeaders.every(h => headers.includes(h))) {
                 return reject(new Error(`CSV headers missing required fields. Expected at least: "${requiredBaseHeaders.join('", "')}". Found: "${headers.join('", "')}"`));
              }
              resolve(results.data);
            }, error: (err) => reject(err),
          });
        });
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const fileBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const headerJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }); // Read headers
        if (headerJson.length === 0) throw new Error("Excel file is empty or has no headers.");
        const headers = headerJson[0].map(String); // Convert headers to string
         if (!requiredBaseHeaders.every(h => headers.includes(h))) {
             throw new Error(`Excel headers missing required fields. Expected at least: "${requiredBaseHeaders.join('", "')}". Found: "${headers.join('", "')}"`);
        }
        parsedData = XLSX.utils.sheet_to_json(worksheet);
      } else {
        throw new Error("Unsupported file type. Please upload a CSV or Excel file (.csv, .xlsx, .xls).");
      }

      if (!parsedData || parsedData.length === 0) {
        throw new Error("No data found in the file or file is improperly formatted.");
      }

      const roomsToUpload = parsedData.map((row, index) => {
        // Assuming CSV/Excel headers match these keys or have been transformed.
        // Backend expects 'departmentName' if linking by name during upload.
        const departmentNameFromFile = row["Department Name"] || row["Department"] || "";
        if (!row["Room No."] || !row["Category"] || row["Floor"] === undefined || row["Capacity"] === undefined) {
          throw new Error(`Row ${index + 2}: Missing required fields (Room No., Category, Floor, Capacity).`);
        }
        const floorNum = parseInt(row["Floor"]);
        const capacityNum = parseInt(row["Capacity"]);
        if (isNaN(floorNum) || floorNum < 0) { throw new Error(`Row ${index + 2} (${row["Room No."]}): Floor must be a non-negative number.`); }
        if (isNaN(capacityNum) || capacityNum < 0) { throw new Error(`Row ${index + 2} (${row["Room No."]}): Capacity must be a non-negative number.`); }
        if (!ROOM_CATEGORIES.includes(String(row["Category"]).trim())) {
            throw new Error(`Row ${index + 2} (${row["Room No."]}): Invalid category "${row["Category"]}". Allowed: ${ROOM_CATEGORIES.join(', ')}.`);
        }
        return {
          roomNumber: String(row["Room No."]).trim(),
          category: String(row["Category"]).trim(),
          floor: floorNum,
          capacity: capacityNum,
          features: String(row["Features"] || "").split(',').map(f => f.trim()).filter(f => f),
          departmentName: departmentNameFromFile ? String(departmentNameFromFile).trim() : null, // Send null if no department name
        };
      });

      // Send to backend endpoint that handles mapping departmentName to departmentId
      const response = await axios.post(`${API_BASE_URL}/rooms/upload`, { rooms: roomsToUpload }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setSuccessMessage(response.data.message || 'File processed.');
      if (response.data.errors && response.data.errors.length > 0) {
          // Format errors for better readability
          setFileError(`Some rooms failed to upload: ${response.data.errors.map(e => `Row ${e.index != null ? e.index + 2 : 'N/A'} (${e.roomNumber || 'Unknown Room'}): ${e.message}`).join('; ')}`);
      }
      fetchRooms(); // Refresh list

    } catch (err) {
      console.error("File Upload Error:", err);
      setFileError(err.response?.data?.message || err.message || 'Failed to upload and process file.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
    }
  };

  // Function to handle Excel download
  const handleDownloadExcel = () => {
    if (rooms.length === 0) {
      alert("No room data to export.");
      return;
    }
    // Prepare data for export
    const dataToExport = rooms.map(room => ({
      "Room Number": room.roomNumber,
      "Category": room.category,
      "Department": room.department ? room.department.name : "Common", // MODIFIED HERE
      "Floor": room.floor,
      "Capacity": room.capacity,
      "Features": room.features.join(', '),
      "Last Updated": new Date(room.updatedAt).toLocaleString(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rooms");
    // Generate file name with current date
    XLSX.writeFile(workbook, `Rooms_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
    setSuccessMessage("Room data exported to Excel successfully.");
  };


  // Common styling classes for inputs, buttons, etc.
  const commonInputStyle = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 disabled:opacity-70 placeholder-gray-400 dark:placeholder-gray-500";
  const commonButtonPrimaryStyle = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50 disabled:bg-blue-400 transition duration-150 ease-in-out flex items-center justify-center";
  const commonButtonSecondaryStyle = "px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-100 rounded-md text-sm font-medium shadow-md focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-50 disabled:opacity-50 transition duration-150 ease-in-out flex items-center justify-center";
  const tableHeaderStyle = "px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider";
  const tableCellStyle = "px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300";


  return (
    <div className="container mx-auto p-4 md:p-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-3 md:gap-4">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 dark:text-white text-center sm:text-left">
            Room Management <span className="text-lg text-gray-600 dark:text-gray-400">{selectedDepartment ? `(${selectedDepartment.name})` : '(All Departments)'}</span>
          </h1>
          {/* Action Buttons: Upload, Export, Add New */}
          {isAdmin && !showForm && ( // Only show these if not in form mode
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {/* File Upload Button */}
                <div className="relative w-full sm:w-auto">
                    <label htmlFor="room-file-upload" className={`w-full sm:w-auto flex justify-center items-center px-4 py-2.5 text-white rounded-md shadow-md cursor-pointer text-sm font-medium ${isUploading ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                        {isUploading ? 'Processing...' : 'Upload File'}
                    </label>
                    <input id="room-file-upload" type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={handleFileUpload} className="hidden" disabled={isUploading || showForm} ref={fileInputRef} />
                </div>
                 {/* Excel Download Button */}
                <button onClick={handleDownloadExcel} disabled={isLoading || rooms.length === 0} className={`w-full sm:w-auto ${commonButtonSecondaryStyle} bg-teal-600 hover:bg-teal-700 text-white disabled:bg-teal-400`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    Export Excel
                </button>
                {/* Add New Room Button */}
                <button onClick={handleShowAddForm} disabled={isUploading || showForm} className={`w-full sm:w-auto ${commonButtonPrimaryStyle} bg-green-600 hover:bg-green-700 disabled:bg-green-400`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                    Add New
                </button>
            </div>
          )}
      </div>

      {/* Error Displays for File Upload and General Actions */}
      {fileError && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900 dark:border-red-700 dark:text-red-200 p-4 rounded-md relative mb-4 text-sm shadow-md" role="alert">
          <button onClick={() => setFileError('')} className="absolute top-0 bottom-0 right-0 px-4 py-3 font-bold">&times;</button>
          <strong className="font-bold block">File Upload Error:</strong>
          <span>{fileError}</span>
        </div>
      )}
      {successMessage && ( // Display general success messages
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 dark:bg-green-900 dark:border-green-700 dark:text-green-200 p-4 rounded-md relative mb-4 text-sm shadow-md" role="alert">
          <button onClick={() => setSuccessMessage('')} className="absolute top-0 bottom-0 right-0 px-4 py-3 font-bold">&times;</button>
          <span>{successMessage}</span>
        </div>
      )}
      {error && !showForm && ( // Display general errors when form is not shown
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900 dark:border-red-700 dark:text-red-200 p-4 rounded-md relative mb-4 text-sm shadow-md" role="alert">
          <button onClick={() => setError('')} className="absolute top-0 bottom-0 right-0 px-4 py-3 font-bold">&times;</button>
          <strong className="font-bold block">Error:</strong>
          <span>{error}</span>
        </div>
      )}

      {/* Add/Edit Room Form */}
      {isAdmin && showForm && (
        <form onSubmit={handleSubmitRoom} className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700">
           <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">
             {isEditMode ? `Edit Room: ${currentRoom?.roomNumber}` : 'Add New Room'}
           </h2>
           {error && ( // Display form-specific errors here
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 dark:bg-red-900 dark:border-red-700 dark:text-red-200 p-3 rounded-md relative mb-4 text-sm shadow-md" role="alert">
                <button onClick={() => setError('')} className="absolute top-0.5 right-1.5 p-2 font-bold text-lg">&times;</button>
                <span>{error}</span>
            </div>
           )}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
             {/* Room Number */}
             <div>
                <label htmlFor="roomNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Room Number*</label>
                <input type="text" id="roomNumber" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} required className={commonInputStyle} disabled={isSubmitting}/>
             </div>
             {/* Category */}
             <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category*</label>
                <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} required className={commonInputStyle} disabled={isSubmitting}>
                    <option value="" disabled>Select a category</option>
                    {ROOM_CATEGORIES.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                </select>
             </div>
             {/* Floor */}
             <div>
                <label htmlFor="floor" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Floor*</label>
                <input type="number" id="floor" value={floor} onChange={(e) => setFloor(e.target.value)} required min="0" className={commonInputStyle} disabled={isSubmitting}/>
             </div>
             {/* Capacity */}
             <div>
                <label htmlFor="capacity" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Capacity*</label>
                <input type="number" id="capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)} required min="0" className={commonInputStyle} disabled={isSubmitting}/>
             </div>
             {/* Department Assignment */}
             <div className="md:col-span-1">
                <label htmlFor="roomDepartmentId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Department</label>
                <select id="roomDepartmentId" value={roomDepartmentId} onChange={(e) => setRoomDepartmentId(e.target.value)} className={commonInputStyle} disabled={isSubmitting || isLoadingDeptsForFilter}>
                    <option value="">Unassigned / Common</option>
                    {departments.map(dept => (<option key={dept.id} value={dept.id}>{dept.name}</option>))}
                </select>
             </div>
             {/* Features */}
             <div className="md:col-span-1"> {/* Adjusted to allow it to be on its own row if needed, or side-by-side */}
                 <label htmlFor="features" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Features (comma-separated)</label>
                 <input type="text" id="features" value={features} onChange={(e) => setFeatures(e.target.value)} placeholder="e.g., Projector, AC" className={commonInputStyle} disabled={isSubmitting}/>
             </div>
           </div>
           {/* Form Action Buttons */}
           <div className="mt-8 flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3">
              <button type="button" onClick={handleCancelForm} disabled={isSubmitting} className={`${commonButtonSecondaryStyle} w-full sm:w-auto`}> Cancel </button>
              <button type="submit" disabled={isSubmitting} className={`${commonButtonPrimaryStyle} w-full sm:w-auto`}>
                 {isSubmitting ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Room' : 'Add Room')}
              </button>
           </div>
        </form>
      )}

      {/* Filter Section */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium mb-3 text-gray-700 dark:text-gray-200">Filter Rooms (within {selectedDepartment ? selectedDepartment.name : 'All Departments'})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Category Filter */}
              <div>
                  <label htmlFor="filterCategory" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                  <select id="filterCategory" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={commonInputStyle}>
                      <option value="">All Categories</option>
                      {ROOM_CATEGORIES.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                  </select>
              </div>
              {/* Floor Filter */}
              <div>
                  <label htmlFor="filterFloor" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Floor</label>
                  <input type="number" id="filterFloor" value={filterFloor} onChange={(e) => setFilterFloor(e.target.value)} min="0" placeholder="Any" className={commonInputStyle}/>
              </div>
              {/* Min Capacity Filter */}
              <div>
                  <label htmlFor="filterMinCapacity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Min. Capacity</label>
                  <input type="number" id="filterMinCapacity" value={filterMinCapacity} onChange={(e) => setFilterMinCapacity(e.target.value)} min="0" placeholder="Any" className={commonInputStyle}/>
              </div>
              {/* Features Filter */}
              <div>
                  <label htmlFor="filterFeatures" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Features (comma-sep)</label>
                  <input type="text" id="filterFeatures" value={filterFeatures} onChange={(e) => setFilterFeatures(e.target.value)} placeholder="e.g., Projector, AC" className={commonInputStyle}/>
              </div>
          </div>
          <div className="mt-4 flex justify-end">
              <button onClick={handleResetFilters} className={`${commonButtonSecondaryStyle} text-xs`} disabled={isLoading || isSubmitting || isUploading}>
                  Reset These Filters
              </button>
          </div>
      </div>

      {/* Rooms Table or Loading/Empty State */}
      {isLoading && <p className="text-center text-gray-600 dark:text-gray-400 py-10">Loading rooms...</p>}
      {!isLoading && rooms.length === 0 && !showForm && ( // Only show "No rooms found" if not in form mode
        <div className="text-center py-10 px-4 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            {/* Icon for empty state */}
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
            </svg>
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No rooms found</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No rooms match {filterCategory || filterFloor || filterMinCapacity || filterFeatures ? 'the current filters' : 'your criteria'} for {selectedDepartment ? selectedDepartment.name : "any department"}.
            </p>
            {isAdmin && ( // Show Add New button if admin and no rooms match
                <div className="mt-6">
                    <button type="button" onClick={handleShowAddForm} className={commonButtonPrimaryStyle}>
                        <svg className="-ml-0.5 mr-1.5 h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                        </svg>
                        Add New Room
                    </button>
                </div>
            )}
        </div>
      )}

      {/* Display Table if rooms exist and not in form mode */}
      {!isLoading && rooms.length > 0 && !showForm && (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-lg rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700/60">
              <tr>
                <th scope="col" className={tableHeaderStyle}>Room No.</th>
                <th scope="col" className={tableHeaderStyle}>Category</th>
                <th scope="col" className={tableHeaderStyle}>Department</th>
                <th scope="col" className={`${tableHeaderStyle} text-center`}>Floor</th>
                <th scope="col" className={`${tableHeaderStyle} text-center`}>Capacity</th>
                <th scope="col" className={tableHeaderStyle}>Features</th>
                {isAdmin && (<th scope="col" className={tableHeaderStyle}>Actions</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rooms.map((room) => (
                <tr key={room.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors duration-150">
                  <td className={`${tableCellStyle} font-medium text-gray-900 dark:text-gray-100`}>{room.roomNumber}</td>
                  <td className={tableCellStyle}>{room.category}</td>
                  <td className={tableCellStyle}>
                    {/* MODIFICATION HERE: Display "Common" if room.department is null */}
                    {room.department ? room.department.name : <span className="italic text-gray-500 dark:text-gray-400">Common</span>}
                  </td>
                  <td className={`${tableCellStyle} text-center`}>{room.floor}</td>
                  <td className={`${tableCellStyle} text-center`}>{room.capacity}</td>
                  <td className={`${tableCellStyle} break-words min-w-[120px] max-w-[250px]`}>
                    {(Array.isArray(room.features) && room.features.length > 0) ? room.features.join(', ') : <span className="text-gray-400 dark:text-gray-500 italic">None</span>}
                  </td>
                  {isAdmin && (
                      <td className={`${tableCellStyle} space-x-2 sm:space-x-3`}>
                          <button onClick={() => handleShowEditForm(room)} disabled={isSubmitting || showForm || isUploading} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Edit Room">Edit</button>
                          <button onClick={() => handleDeleteRoom(room.id, room.roomNumber)} disabled={isSubmitting || showForm || isUploading} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Delete Room">Delete</button>
                      </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default RoomManagementPage;
