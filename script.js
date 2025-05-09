import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js';
import { 
  getStorage, 
  ref as storageRef, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  serverTimestamp, 
  deleteDoc, 
  doc 
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

// Global marker tracking
const markers = {};
// Marker cluster group
let markerClusterGroup;

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDOiM0cE_ZMNyaMWKN2qLUFNOKBzckX4lQ",
  authDomain: "photomap-126d9.firebaseapp.com",
  projectId: "photomap-126d9",
  storageBucket: "photomap-126d9.appspot.com",
  messagingSenderId: "1050413195252",
  appId: "1:1050413195252:web:871484345b1fe9d310a3a1"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app, "gs://photomap-126d9.firebasestorage.app");
const db = getFirestore(app);

// Map setup with circular view optimizations
const map = L.map('map', {
  maxBounds: [
    [-90, -180],  // Southwest corner of the world
    [90, 180]     // Northeast corner of the world
  ],
  maxBoundsViscosity: 1.0,  // Makes the bounds "sticky"
  worldCopyJump: true,      // Better panning across the date line
  minZoom: 1.5,             // Allow seeing most of the world
  maxZoom: 19,
  zoomControl: false        // We'll add this in a custom position
}).setView([20, 0], 2);     // Center on the equator

// Add zoom control in a better position for the circular map
L.control.zoom({
  position: 'bottomright'
}).addTo(map);

// Initialize marker cluster group with custom options
markerClusterGroup = L.markerClusterGroup({
  showCoverageOnHover: false,
  maxClusterRadius: 50,
  spiderfyOnMaxZoom: true,
  disableClusteringAtZoom: 16,
  iconCreateFunction: function(cluster) {
    const count = cluster.getChildCount();
    let size = 'small';
    
    if (count > 50) {
      size = 'large';
    } else if (count > 10) {
      size = 'medium';
    }
    
    return L.divIcon({
      html: `<div><span>${count}</span></div>`,
      className: `marker-cluster marker-cluster-${size}`,
      iconSize: new L.Point(40, 40)
    });
  }
});

// Add the cluster group to the map
map.addLayer(markerClusterGroup);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
  noWrap: true  // Prevents the tile layer from repeating horizontally
}).addTo(map);

// Click on map to set coordinates
let clickMarker = null;
map.on('click', function(e) {
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;
  
  // Update form fields
  document.getElementById("latInput").value = lat.toFixed(6);
  document.getElementById("lngInput").value = lng.toFixed(6);
  
  // Add or move temporary marker
  if (clickMarker) {
    clickMarker.setLatLng([lat, lng]);
  } else {
    clickMarker = L.marker([lat, lng], {
      opacity: 0.7,
      draggable: true
    }).addTo(map);
    
    // Update coordinates when marker is dragged
    clickMarker.on('dragend', function() {
      const position = clickMarker.getLatLng();
      document.getElementById("latInput").value = position.lat.toFixed(6);
      document.getElementById("lngInput").value = position.lng.toFixed(6);
    });
    
    // Show the cancel button when marker is added
    document.getElementById("cancelLocationBtn").style.display = "inline-block";
  }
  
  clickMarker.bindPopup("Upload location").openPopup();
});

// Function to cancel location selection
window.cancelLocation = function() {
  if (clickMarker) {
    map.removeLayer(clickMarker);
    clickMarker = null;
    
    // Clear the form fields
    document.getElementById("latInput").value = "";
    document.getElementById("lngInput").value = "";
    
    // Hide the cancel button
    document.getElementById("cancelLocationBtn").style.display = "none";
  }
};

// Geolocation support
window.useCurrentLocation = function() {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser");
    return;
  }
  
  const locationBtn = document.getElementById("locationBtn");
  locationBtn.disabled = true;
  locationBtn.textContent = "Getting location...";
  
  navigator.geolocation.getCurrentPosition(position => {
    document.getElementById("latInput").value = position.coords.latitude.toFixed(6);
    document.getElementById("lngInput").value = position.coords.longitude.toFixed(6);
    
    // Center map on user's location
    map.setView([position.coords.latitude, position.coords.longitude], 12);
    
    // Add a temporary marker to show the location
    if (clickMarker) {
      clickMarker.setLatLng([position.coords.latitude, position.coords.longitude]);
    } else {
      clickMarker = L.marker([position.coords.latitude, position.coords.longitude], {
        opacity: 0.7,
        draggable: true
      }).addTo(map);
      
      // Update coordinates when marker is dragged
      clickMarker.on('dragend', function() {
        const position = clickMarker.getLatLng();
        document.getElementById("latInput").value = position.lat.toFixed(6);
        document.getElementById("lngInput").value = position.lng.toFixed(6);
      });
      
      // Show the cancel button when marker is added
      document.getElementById("cancelLocationBtn").style.display = "inline-block";
    }
    
    clickMarker.bindPopup("Your location").openPopup();
    
    locationBtn.disabled = false;
    locationBtn.textContent = "📍 Use My Location";
  }, error => {
    console.error("Error getting location:", error);
    alert(`Couldn't get your location: ${error.message}`);
    locationBtn.disabled = false;
    locationBtn.textContent = "📍 Use My Location";
  });
};

// Function to upload file for marker
window.uploadFile = async function() {
  try {
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];
    const label = document.getElementById("labelInput").value;
    const lat = parseFloat(document.getElementById("latInput").value);
    const lng = parseFloat(document.getElementById("lngInput").value);
    const category = document.getElementById("categorySelect").value || "default";

    if (!file) {
      return alert("Please select a file to upload");
    }
    
    if (!label || label.trim() === "") {
      return alert("Please provide a label for the photo");
    }
    
    if (isNaN(lat) || isNaN(lng)) {
      return alert("Please provide valid coordinates");
    }

    // Check for existing photos at the same coordinates
    const photosCollection = collection(db, "photos");
    const snapshot = await getDocs(photosCollection);
    let isDuplicate = false;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.coords && 
          Math.abs(data.coords[0] - lat) < 0.000001 && 
          Math.abs(data.coords[1] - lng) < 0.000001) {
        isDuplicate = true;
      }
    });
    
    if (isDuplicate) {
      if (!confirm("A photo already exists at these coordinates. Do you want to add another?")) {
        return;
      }
    }

    // Show upload is happening
    const uploadBtn = document.querySelector(".upload-btn");
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";
    
    // Upload file to Storage
    const fileRef = storageRef(storage, 'photos/' + file.name);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    // Save metadata to Firestore with category
    const photoData = {
      coords: [lat, lng],
      label,
      filename: file.name,
      category,
      uploadedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, "photos"), photoData);

    // Add the new marker with custom icon based on category
    const marker = createCategoryMarker([lat, lng], category);
    markers[docRef.id] = marker;
    marker.bindPopup(
      `<div class="popup-content">
        <strong>${label}</strong>
        <p>Category: ${category}</p>
        <img src="${url}" alt="${label}" width="150">
        <button class="delete-btn" onclick="deletePhoto('${docRef.id}', '${file.name}', this)">
          🗑️ Remove
        </button>
      </div>`
    );
    
    // Add the marker to the cluster group
    markerClusterGroup.addLayer(marker);
    
    // Clear form
    fileInput.value = "";
    document.getElementById("labelInput").value = "";
    document.getElementById("latInput").value = "";
    document.getElementById("lngInput").value = "";
    document.getElementById("categorySelect").value = "default";

    // Clear the temporary marker after successful upload
    if (clickMarker) {
      map.removeLayer(clickMarker);
      clickMarker = null;
      
      // Hide the cancel button
      document.getElementById("cancelLocationBtn").style.display = "none";
    }

    uploadBtn.disabled = false;
    uploadBtn.textContent = "Upload Photo";

    alert("Photo uploaded successfully!");
  } catch (error) {
    console.error("Upload failed:", error);
    alert("Upload failed: " + error.message);
    document.querySelector(".upload-btn").disabled = false;
    document.querySelector(".upload-btn").textContent = "Upload Photo";
  }
};

// Function to delete a photo and its marker
window.deletePhoto = async function(docId, filename, buttonElement) {
  try {
    if (!confirm("Are you sure you want to delete this photo?")) {
      return;
    }
    
    // Disable the button to prevent multiple clicks
    buttonElement.disabled = true;
    buttonElement.textContent = "Deleting...";
    
    // Delete the document from Firestore
    await deleteDoc(doc(db, "photos", docId));
    
    // Delete the file from Storage
    const fileRef = storageRef(storage, 'photos/' + filename);
    await deleteObject(fileRef);
    
    // Remove the marker from the map
    if (markers[docId]) {
      markerClusterGroup.removeLayer(markers[docId]);
      delete markers[docId];
    }
    
    // Close the popup manually (since we removed the marker)
    map.closePopup();
    
    console.log("Photo deleted successfully");
  } catch (error) {
    console.error("Error deleting photo:", error);
    alert("Error deleting photo: " + error.message);
    
    // Re-enable the button on error
    buttonElement.disabled = false;
    buttonElement.textContent = "🗑️ Remove";
  }
};

function createCategoryMarker(coords, category = 'default') {
  const markerColors = {
    default: '#2B83CF',
    travel: '#FF5722',
    food: '#4CAF50',
    family: '#9C27B0',
    nature: '#009688',
    events: '#FFC107'
  };

  // Create a color-based marker icon
  const color = markerColors[category] || markerColors.default;

  const icon = L.divIcon({
    className: 'custom-marker',
    html: `<svg width="30" height="40" viewBox="0 0 30 40">
            <path 
              d="M15 0C6.716 0 0 6.716 0 15c0 8.284 15 25 15 25s15-16.716 15-25C30 6.716 23.284 0 15 0z" 
              fill="${color}" 
              stroke="#FFF"
              stroke-width="1"
            />
            <circle cx="15" cy="15" r="7" fill="white" />
          </svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -40]
  });

  const marker = L.marker(coords, { icon: icon });
  
  // Add hover effects using event listeners
  marker.on('mouseover', function() {
    this._icon.style.zIndex = 1000;
  });
  
  marker.on('mouseout', function() {
    this._icon.style.zIndex = '';
  });

  return marker;
}

// Modify loadMarkers function to use category markers
async function loadMarkers() {
  try {
    // Clear all existing markers first from the cluster group
    markerClusterGroup.clearLayers();

    // Reset the markers object
    Object.keys(markers).forEach(key => delete markers[key]);

    const snapshot = await getDocs(collection(db, 'photos'));

    // Set to track coordinates we've already placed markers at
    const coordinatesSet = new Set();

    snapshot.forEach(async (doc) => {
      const data = doc.data();
      const { coords, label, filename, category = 'default' } = data;
      const docId = doc.id;
      
      if (!coords || !Array.isArray(coords) || coords.length !== 2) {
        console.error("Invalid coordinates for document:", docId);
        return;
      }
      
      if (!filename || !label) {
        console.error("Missing filename or label for document:", docId);
        return;
      }
      
      // Create a string key for the coordinates
      const coordKey = `${coords[0].toFixed(6)},${coords[1].toFixed(6)}`;
      
      // Skip if we've already added a marker at these coordinates
      if (coordinatesSet.has(coordKey)) {
        return;
      }
      
      coordinatesSet.add(coordKey);

      try {
        const url = await getDownloadURL(storageRef(storage, 'photos/' + filename));
        
        // Create marker with category styling
        const marker = createCategoryMarker(coords, category);
        
        // Store marker reference with document ID
        markers[docId] = marker;
        
        marker.bindPopup(
          `<div class="popup-content">
            <strong>${label}</strong>
            <p>Category: ${category}</p>
            <img src="${url}" alt="${label}" width="150">
            <button class="delete-btn" onclick="deletePhoto('${docId}', '${filename}', this)">
              🗑️ Remove
            </button>
          </div>`
        );
        
        // Add to cluster group instead of directly to map
        markerClusterGroup.addLayer(marker);
      } catch (error) {
        console.error(`Could not load image for "${label}" (${filename}):`, error.code || error.message || error);
      }
    });
  } catch (error) {
    console.error("Error loading markers:", error);
  }
}

// Function to set the background image from Firebase Storage
async function setBackgroundImage() {
  try {
    const bgImageRef = storageRef(storage, 'bckgrnd/space.webp');
    const backgroundUrl = await getDownloadURL(bgImageRef);
    
    // Set the background image of the map container
    const mapContainer = document.querySelector('.map-container');
    mapContainer.style.backgroundImage = `url(${backgroundUrl})`;
    mapContainer.style.backgroundSize = 'cover';
    mapContainer.style.backgroundPosition = 'center';
  } catch (error) {
    console.error("Could not load background image:", error.code || error.message || error);
  }
}

// Dark mode toggle handler
document.addEventListener('DOMContentLoaded', () => {
  // Check for saved preference
  const darkMode = localStorage.getItem('darkMode') === 'enabled';
  const darkModeToggle = document.getElementById('darkModeToggle');
  
  // Set initial state
  if (darkMode) {
    document.body.classList.add('dark-mode');
    darkModeToggle.checked = true;
    updateMapTiles(true);
  }
  
  // Toggle dark mode
  darkModeToggle.addEventListener('change', () => {
    if (darkModeToggle.checked) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('darkMode', 'enabled');
      updateMapTiles(true);
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('darkMode', 'disabled');
      updateMapTiles(false);
    }
  });
  
  // Hide cancel button initially
  if (document.getElementById("cancelLocationBtn")) {
    document.getElementById("cancelLocationBtn").style.display = "none";
  }
});

// Update map tiles based on mode
function updateMapTiles(isDark) {
  // Remove current tile layer
  map.eachLayer(layer => {
    if (layer instanceof L.TileLayer) {
      map.removeLayer(layer);
    }
  });
  
  // Add appropriate tile layer
  if (isDark) {
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
      noWrap: true
    }).addTo(map);
  } else {
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
      noWrap: true
    }).addTo(map);
  }
}

// Load markers and set background when the page loads
document.addEventListener('DOMContentLoaded', () => {
  loadMarkers();
  setBackgroundImage();
});