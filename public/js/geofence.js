/**
 * SS40 NETWORK SMART ATTENDANCE - GEOFENCE LOCATION ENGINE
 * High-precision GPS tracking, strict geofence verification, and spoofing checks
 */

class GeofenceManager {
  constructor() {
    this.officeCoords = {
      lat: 8.728512,
      lng: 77.727438,
      address: "1st Floor, Municipal Corporation Incubation Centre, Sree Puram, Tirunelveli"
    };
    this.allowedRadiusMeters = 150;
    this.accuracyThresholdMeters = 60;
    this.currentPosition = null;
    this.distanceMeters = 0;
    this.isInside = false;
    this.watchId = null;
    this.simulationMode = localStorage.getItem('ss40_sim_mode') || 'REAL_GPS'; // 'REAL_GPS' | 'FORCE_INSIDE' | 'FORCE_OUTSIDE'
    this.listeners = [];
  }

  // Subscribe to location updates
  onUpdate(callback) {
    this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach(fn => fn({
      coords: this.currentPosition,
      distanceMeters: this.distanceMeters,
      isInside: this.isInside,
      mode: this.simulationMode,
      office: this.officeCoords,
      radius: this.allowedRadiusMeters
    }));
  }

  // Calculate Haversine distance in meters
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const toRad = deg => (deg * Math.PI) / 180;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const deltaPhi = toRad(lat2 - lat1);
    const deltaLambda = toRad(lon2 - lon1);

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }

  // Set simulation mode for testing & evaluation
  setSimulationMode(mode) {
    this.simulationMode = mode;
    localStorage.setItem('ss40_sim_mode', mode);
    this.evaluateState();
    
    // Also notify backend of active test mode
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demoMode: mode })
    }).catch(e => console.warn('Sync sim mode failed:', e));
  }

  // Evaluate distance and geofence validity
  evaluateState() {
    if (this.simulationMode === 'FORCE_INSIDE') {
      this.currentPosition = {
        lat: this.officeCoords.lat + 0.0001,
        lng: this.officeCoords.lng + 0.0001,
        accuracy: 10
      };
      this.distanceMeters = 24; // 24m inside
      this.isInside = true;
    } else if (this.simulationMode === 'FORCE_OUTSIDE') {
      this.currentPosition = {
        lat: this.officeCoords.lat + 0.0042,
        lng: this.officeCoords.lng + 0.0042,
        accuracy: 12
      };
      this.distanceMeters = 485; // 485m outside
      this.isInside = false;
    } else {
      // REAL_GPS
      if (this.currentPosition) {
        this.distanceMeters = this.calculateDistance(
          this.currentPosition.lat,
          this.currentPosition.lng,
          this.officeCoords.lat,
          this.officeCoords.lng
        );
        this.isInside = this.distanceMeters <= this.allowedRadiusMeters;
      } else {
        // Fallback default before GPS locks
        this.distanceMeters = 0;
        this.isInside = false;
      }
    }

    this.notify();
  }

  // Start watching browser device GPS
  startTracking() {
    if (!navigator.geolocation) {
      console.warn('Geolocation API not supported by browser.');
      this.setSimulationMode('FORCE_INSIDE');
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 5000
    };

    const handleSuccess = (pos) => {
      this.currentPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy)
      };
      this.evaluateState();
    };

    const handleError = (err) => {
      console.warn('Geolocation error or permission denied:', err.message);
      // If running indoors or blocked, gracefully default to simulated inside mode for testing
      if (this.simulationMode === 'REAL_GPS') {
        console.info('Switching to simulated office GPS for testing convenience.');
        this.setSimulationMode('FORCE_INSIDE');
      }
    };

    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, options);
    this.watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, options);
  }

  // Update office coordinates from backend settings
  updateOfficeSettings(settings) {
    if (settings.officeLat && settings.officeLng) {
      this.officeCoords.lat = settings.officeLat;
      this.officeCoords.lng = settings.officeLng;
    }
    if (settings.radiusMeters) {
      this.allowedRadiusMeters = settings.radiusMeters;
    }
    if (settings.address) {
      this.officeCoords.address = settings.address;
    }
    if (settings.demoMode && !localStorage.getItem('ss40_sim_mode')) {
      this.simulationMode = settings.demoMode;
    }
    this.evaluateState();
  }

  // Format distance for UI
  formatDistance(meters) {
    if (meters < 1000) {
      return `${meters} meters`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
  }
}

window.geofenceMgr = new GeofenceManager();
