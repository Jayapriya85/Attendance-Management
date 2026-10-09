/**
 * SS40 NETWORK SMART ATTENDANCE - DUAL BARCODE SCANNER ENGINE
 * 1. Mobile Camera Barcode Scanner (WebRTC Html5Qrcode)
 * 2. Desktop Hardware USB / Bluetooth Barcode Gun Listener
 */

class BarcodeScannerEngine {
  constructor() {
    this.html5QrCode = null;
    this.isCameraRunning = false;
    this.currentCameraId = null;
    this.availableCameras = [];
    this.lastScannedCode = null;
    this.lastScanTimestamp = 0;
    this.scanCooldownMs = 3500; // prevent duplicate bursts

    // USB Hardware Barcode Gun Buffer
    this.barcodeBuffer = '';
    this.lastKeyTime = 0;
    this.usbMaxKeyIntervalMs = 60; // hardware scanners emit keys under 50ms

    this.onBarcodeDetected = null; // callback (code, method)
    this.initHardwareListener();
  }

  setCallback(callback) {
    this.onBarcodeDetected = callback;
  }

  // -----------------------------------------------------------------
  // 1. MOBILE CAMERA WEBRTC SCANNER
  // -----------------------------------------------------------------
  async initCamera(containerId = 'camera-preview') {
    if (typeof Html5Qrcode === 'undefined') {
      console.warn('Html5Qrcode library not loaded yet.');
      return false;
    }

    try {
      if (!this.html5QrCode) {
        this.html5QrCode = new Html5Qrcode(containerId);
      }

      this.availableCameras = await Html5Qrcode.getCameras();
      if (!this.availableCameras || this.availableCameras.length === 0) {
        console.warn('No video cameras found on device.');
        return false;
      }

      // Prioritize environment (back) camera on mobile phones
      const backCam = this.availableCameras.find(cam =>
        cam.label.toLowerCase().includes('back') ||
        cam.label.toLowerCase().includes('environment') ||
        cam.label.toLowerCase().includes('rear')
      );
      this.currentCameraId = backCam ? backCam.id : this.availableCameras[0].id;

      return await this.startCamera();
    } catch (err) {
      console.warn('Camera initialization error:', err);
      return false;
    }
  }

  async startCamera() {
    if (!this.html5QrCode || this.isCameraRunning) return;

    const config = {
      fps: 15,
      qrbox: { width: 260, height: 160 },
      aspectRatio: 1.5,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.UPC_A
      ]
    };

    try {
      await this.html5QrCode.start(
        this.currentCameraId ? { deviceId: { exact: this.currentCameraId } } : { facingMode: "environment" },
        config,
        (decodedText, decodedResult) => {
          this.handleDetectedCode(decodedText, 'CAMERA_BARCODE');
        },
        (errorMessage) => {
          // Standard scanning frame error (ignorable)
        }
      );
      this.isCameraRunning = true;
      return true;
    } catch (err) {
      console.warn('Failed to start camera:', err);
      this.isCameraRunning = false;
      return false;
    }
  }

  async stopCamera() {
    if (this.html5QrCode && this.isCameraRunning) {
      try {
        await this.html5QrCode.stop();
        this.isCameraRunning = false;
      } catch (err) {
        console.warn('Error stopping camera:', err);
      }
    }
  }

  async switchCamera() {
    if (this.availableCameras.length < 2) return;
    await this.stopCamera();
    
    // Pick next camera in list
    const currentIndex = this.availableCameras.findIndex(c => c.id === this.currentCameraId);
    const nextIndex = (currentIndex + 1) % this.availableCameras.length;
    this.currentCameraId = this.availableCameras[nextIndex].id;

    await this.startCamera();
  }

  // -----------------------------------------------------------------
  // 2. HARDWARE USB / BLUETOOTH BARCODE GUN LISTENER
  // -----------------------------------------------------------------
  initHardwareListener() {
    window.addEventListener('keydown', (e) => {
      // If user is typing in a standard modal form (e.g. Add Employee name/email), don't intercept
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isInput = (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select');
      const isBarcodeSpecificInput = document.activeElement && document.activeElement.id === 'manual-barcode-input';

      // If user is typing in standard modal inputs, leave it alone
      if (isInput && !isBarcodeSpecificInput) {
        return;
      }

      const currentTime = Date.now();
      const timeDiff = currentTime - this.lastKeyTime;
      this.lastKeyTime = currentTime;

      // Enter key marks the end of a hardware barcode scan burst
      if (e.key === 'Enter') {
        if (this.barcodeBuffer.length >= 4) {
          e.preventDefault();
          const scanned = this.barcodeBuffer.trim();
          this.barcodeBuffer = '';
          this.handleDetectedCode(scanned, 'USB_HARDWARE');
          return;
        }
        this.barcodeBuffer = '';
        return;
      }

      // Ignore modifiers
      if (e.key.length > 1) return;

      // Check key timing: hardware scanners emit characters with < 60ms gap
      if (timeDiff > this.usbMaxKeyIntervalMs) {
        this.barcodeBuffer = ''; // Reset buffer if it was a human typing slowly
      }

      this.barcodeBuffer += e.key;
    });
  }

  // -----------------------------------------------------------------
  // CODE DISPATCH & DEBOUNCING
  // -----------------------------------------------------------------
  handleDetectedCode(code, method) {
    if (!code) return;
    const clean = code.trim();
    const now = Date.now();

    // Prevent duplicate scans within cooldown window
    if (clean === this.lastScannedCode && (now - this.lastScanTimestamp) < this.scanCooldownMs) {
      return;
    }

    this.lastScannedCode = clean;
    this.lastScanTimestamp = now;

    if (this.onBarcodeDetected) {
      this.onBarcodeDetected(clean, method);
    }
  }
}

window.barcodeScanner = new BarcodeScannerEngine();
