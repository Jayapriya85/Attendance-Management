/**
 * SS40 NETWORK SMART ATTENDANCE - DUAL BARCODE SCANNER ENGINE
 * 1. Mobile & Webcam WebRTC Barcode Scanner (Html5Qrcode)
 * 2. Image Barcode Scanner (file upload / drag & drop fallback)
 * 3. Desktop Hardware USB / Bluetooth Barcode Gun Listener
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
    this.isTorchOn = false;

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

  getSupportedFormatsList() {
    if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
      return [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.ITF
      ];
    }
    return undefined;
  }

  // -----------------------------------------------------------------
  // 1. MOBILE CAMERA WEBRTC SCANNER
  // -----------------------------------------------------------------
  async initCamera(containerId = 'camera-preview') {
    if (typeof Html5Qrcode === 'undefined') {
      console.warn('Html5Qrcode library not loaded yet.');
      this.renderCameraState(containerId, 'Scanner library is loading. Please refresh.');
      return false;
    }

    try {
      if (!this.html5QrCode) {
        this.html5QrCode = new Html5Qrcode(containerId, {
          formatsToSupport: this.getSupportedFormatsList(),
          experimentalFeatures: { useBarCodeDetectorIfSupported: false },
          verbose: false
        });
      }

      if (this.isCameraRunning) {
        return true;
      }

      return await this.startCamera(containerId);
    } catch (err) {
      console.warn('Camera initialization error:', err.message || err);
      this.renderCameraState(containerId, 'Camera permission required. Click below to allow camera or use USB/Manual mode.');
      return false;
    }
  }

  async startCamera(containerId = 'camera-preview') {
    if (this.isCameraRunning) return true;

    // Update UI indicator to starting state
    const toggleLabel = document.getElementById('camera-toggle-label');
    if (toggleLabel) toggleLabel.textContent = 'Connecting...';
    this.updateHintText('Initializing camera feed, please wait...', false);

    // 1. Detect device cameras
    let chosenCamera = null;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    try {
      this.availableCameras = await Html5Qrcode.getCameras();
      if (this.availableCameras && this.availableCameras.length > 0) {
        // Mobile preference: rear/environment camera
        const rearCam = this.availableCameras.find(c => /back|rear|environment/i.test(c.label || ''));
        if (isMobile && rearCam) {
          this.currentCameraId = rearCam.id;
          chosenCamera = rearCam.id;
        } else {
          // Default to first detected hardware camera (front webcam on laptop / desktop)
          this.currentCameraId = this.availableCameras[0].id;
          chosenCamera = this.availableCameras[0].id;
        }
        console.log(`[Scanner] Selected hardware camera: ${chosenCamera}`);
      }
    } catch (enumErr) {
      console.warn('[Scanner] Camera enumeration note:', enumErr);
    }

    // Fallback camera specification if enumeration was empty or not yet permitted
    if (!chosenCamera) {
      chosenCamera = { facingMode: isMobile ? 'environment' : 'user' };
    }

    // 2. Clean up any previous scanner session
    try {
      if (this.html5QrCode) {
        try { await this.html5QrCode.stop(); } catch (e) {}
        try { await this.html5QrCode.clear(); } catch (e) {}
        this.html5QrCode = null;
      }
    } catch (e) {}

    // Clear the container
    const previewContainer = document.getElementById(containerId);
    if (previewContainer) {
      previewContainer.innerHTML = '';
    }

    // 3. Create fresh Html5Qrcode instance
    try {
      this.html5QrCode = new Html5Qrcode(containerId, {
        formatsToSupport: this.getSupportedFormatsList(),
        experimentalFeatures: { useBarCodeDetectorIfSupported: false },
        verbose: false
      });
    } catch (instErr) {
      console.error('[Scanner] Html5Qrcode instantiation error:', instErr);
      this.renderCameraState(containerId, 'Scanner initialization failed. Please reload.');
      this.updateToggleButtonState(false);
      return false;
    }

    const config = {
      fps: 20,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        // Broad aspect ratio optimized for Code-128 linear ID card barcodes
        const w = Math.min(Math.floor(viewfinderWidth * 0.92), 440);
        const h = Math.min(Math.floor(viewfinderHeight * 0.80), 280);
        return { width: Math.max(w, 280), height: Math.max(h, 160) };
      }
    };

    const onScan = (decodedText, decodedResult) => {
      this.handleDetectedCode(decodedText, 'CAMERA_BARCODE');
    };

    const onError = (errorMessage) => {
      // Frame analysis
    };

    const markSuccess = (label) => {
      this.isCameraRunning = true;
      this.updateAimOverlay(true);
      this.updateToggleButtonState(true);
      this.updateHintText('Scanner Active: Position ID barcode 15&ndash;20cm from camera', false);
      this.startGuidanceTimer();
      console.log(`[Scanner] Camera stream active via: ${label}`);
      this.startLiveBarcodeDetector();
    };

    // 4. Start stream with primary selected camera
    try {
      await this.html5QrCode.start(chosenCamera, config, onScan, onError);
      markSuccess(typeof chosenCamera === 'string' ? chosenCamera : JSON.stringify(chosenCamera));
      return true;
    } catch (primaryErr) {
      console.warn('[Scanner] Primary camera start attempt failed, trying basic user camera fallback...', primaryErr);

      // Clean and recreate instance for safe secondary attempt
      try {
        if (this.html5QrCode) {
          try { await this.html5QrCode.stop(); } catch (e) {}
          try { await this.html5QrCode.clear(); } catch (e) {}
          this.html5QrCode = null;
        }
      } catch (e) {}

      if (previewContainer) {
        previewContainer.innerHTML = '';
      }

      try {
        this.html5QrCode = new Html5Qrcode(containerId, {
          formatsToSupport: this.getSupportedFormatsList(),
          verbose: false
        });

        await this.html5QrCode.start({ facingMode: 'user' }, config, onScan, onError);
        markSuccess('User camera (Fallback)');
        return true;
      } catch (fallbackErr) {
        console.error('[Scanner] All camera start attempts failed:', fallbackErr);
        this.isCameraRunning = false;
        this.stopLiveBarcodeDetector();
        this.updateAimOverlay(false);
        this.updateToggleButtonState(false);
        this.renderCameraState(
          containerId,
          'Camera access failed or permission was blocked. Please permit camera in your browser address bar.'
        );
        return false;
      }
    }
  }

  async startLiveBarcodeDetector() {
    this.stopLiveBarcodeDetector();

    if (!('BarcodeDetector' in window)) {
      console.log('[Scanner] Using Html5Qrcode ZXing engine for barcode scanning.');
      return;
    }

    let detector = null;
    try {
      const supported = await BarcodeDetector.getSupportedFormats();
      const targetFormats = ['code_128', 'code_39', 'qr_code', 'ean_13', 'upc_a', 'itf']
        .filter(f => supported.includes(f));

      if (targetFormats.length === 0) {
        console.log('[Scanner] Native BarcodeDetector lacks 1D barcode formats. Html5Qrcode ZXing engine handles decoding.');
        return;
      }
      detector = new BarcodeDetector({ formats: targetFormats });
    } catch (e) {
      console.warn('[Scanner] BarcodeDetector init notice:', e);
      return;
    }

    const scanFrame = async () => {
      if (!this.isCameraRunning) return;

      const videoEl = document.querySelector('#camera-preview video');
      if (videoEl && videoEl.readyState >= 2 && !videoEl.paused && !videoEl.ended) {
        try {
          const barcodes = await detector.detect(videoEl);
          if (barcodes && barcodes.length > 0) {
            for (const b of barcodes) {
              const val = b.rawValue ? b.rawValue.trim() : '';
              if (val) {
                this.handleDetectedCode(val, 'CAMERA_BARCODE');
                break;
              }
            }
          }
        } catch (err) {
          // Frame decode error - continue to next frame
        }
      }

      if (this.isCameraRunning) {
        this.liveScanTimer = setTimeout(scanFrame, 90);
      }
    };

    // Give camera 250ms to initialize first frame
    setTimeout(() => {
      if (this.isCameraRunning) {
        scanFrame();
      }
    }, 250);
  }

  stopLiveBarcodeDetector() {
    if (this.liveScanTimer) {
      clearTimeout(this.liveScanTimer);
      cancelAnimationFrame(this.liveScanTimer);
      this.liveScanTimer = null;
    }
  }

  updateToggleButtonState(running) {
    const textEl = document.getElementById('camera-toggle-label') || document.getElementById('camera-toggle-btn-text');
    if (textEl) {
      textEl.textContent = running ? 'Stop Camera' : 'Start Camera';
    }
  }

  async stopCamera() {
    this.stopGuidanceTimer();
    this.stopLiveBarcodeDetector();
    this.updateHintText('Camera Scanner Paused. Click "Start Camera" to scan your ID card.', false);
    if (this.html5QrCode && this.isCameraRunning) {
      try {
        await this.html5QrCode.stop();
      } catch (err) {
        console.warn('[Scanner] Error stopping camera:', err);
      }
    }
    this.isCameraRunning = false;
    this.updateAimOverlay(false);
    this.updateToggleButtonState(false);
    this.renderCameraState('camera-preview', 'Camera is paused. Click "Start Camera" to scan your ID card.');
    // Reset illumination visuals
    this.isTorchOn = false;
    const torchBtn = document.getElementById('toggle-torch-btn');
    if (torchBtn) {
      torchBtn.classList.remove('active');
      torchBtn.setAttribute('title', 'Toggle Lighting Torch / High-Contrast Mode');
    }
    const viewportWrap = document.getElementById('camera-viewport-wrap');
    if (viewportWrap) viewportWrap.classList.remove('illumination-active');
  }

  async switchCamera() {
    const switchBtn = document.getElementById('switch-camera-btn');
    if (switchBtn) {
      switchBtn.classList.add('spinning');
      setTimeout(() => switchBtn.classList.remove('spinning'), 700);
    }

    try {
      this.availableCameras = await Html5Qrcode.getCameras();
    } catch (e) {
      this.availableCameras = [];
    }

    // Case 1: Multiple physical cameras detected (e.g. mobile rear & front, dual webcams)
    if (this.availableCameras && this.availableCameras.length >= 2) {
      await this.stopCamera();
      const currentIndex = this.availableCameras.findIndex(c => c.id === this.currentCameraId);
      const nextIndex = (currentIndex + 1) % this.availableCameras.length;
      this.currentCameraId = this.availableCameras[nextIndex].id;

      await this.startCamera('camera-preview');
      const camLabel = this.availableCameras[nextIndex].label || `Camera ${nextIndex + 1}`;
      if (window.apiService) {
        window.apiService.showToast(`Switched to: ${camLabel}`, 'success');
      }
      return;
    }

    // Case 2: Single camera or stopped -> Reconnect and refresh camera video stream
    if (window.apiService) {
      window.apiService.showToast('Refreshing camera stream...', 'info');
    }
    await this.stopCamera();
    const restarted = await this.startCamera('camera-preview');
    if (restarted) {
      if (window.apiService) {
        window.apiService.showToast('Camera feed refreshed & active', 'success');
      }
    } else {
      if (window.apiService) {
        window.apiService.showToast('Camera reloaded. Click "Activate Camera" to permit.', 'info');
      }
    }
  }

  async toggleTorch() {
    // If camera is not currently running, start it first!
    if (!this.isCameraRunning) {
      if (window.apiService) {
        window.apiService.showToast('Starting camera stream...', 'info');
      }
      const started = await this.startCamera('camera-preview');
      if (!started) {
        if (window.apiService) {
          window.apiService.showToast('Please activate camera first to use lighting controls.', 'warning');
        }
        return;
      }
    }

    this.isTorchOn = !this.isTorchOn;
    const torchBtn = document.getElementById('toggle-torch-btn');
    const viewportWrap = document.getElementById('camera-viewport-wrap');
    const videoEl = document.querySelector('#camera-preview video');

    // 1. Attempt hardware torch on supported mobile devices
    let hardwareTorchWorked = false;
    if (this.html5QrCode && this.isCameraRunning) {
      try {
        await this.html5QrCode.applyVideoConstraints({
          advanced: [{ torch: this.isTorchOn }]
        });
        hardwareTorchWorked = true;
      } catch (e) {
        // Hardware torch not supported on webcams/laptops
        hardwareTorchWorked = false;
      }
    }

    // 2. High-contrast illumination & lighting boost across all webcams and desktop devices
    if (this.isTorchOn) {
      if (torchBtn) {
        torchBtn.classList.add('active');
        torchBtn.setAttribute('title', 'Illumination Active (Click to disable)');
      }
      if (viewportWrap) {
        viewportWrap.classList.add('illumination-active');
      }
      if (videoEl) {
        videoEl.style.filter = 'brightness(1.35) contrast(1.25) saturate(1.15)';
      }
      if (window.apiService) {
        window.apiService.showToast(
          hardwareTorchWorked ? 'Camera Torch Enabled' : 'High-Contrast Illumination Enabled',
          'success'
        );
      }
    } else {
      if (torchBtn) {
        torchBtn.classList.remove('active');
        torchBtn.setAttribute('title', 'Toggle Lighting Torch / High-Contrast Mode');
      }
      if (viewportWrap) {
        viewportWrap.classList.remove('illumination-active');
      }
      if (videoEl) {
        videoEl.style.filter = '';
      }
      if (window.apiService) {
        window.apiService.showToast('Camera Lighting Restored to Normal', 'info');
      }
    }
  }

  updateAimOverlay(active) {
    const aimOverlay = document.querySelector('.scan-aim-overlay');
    if (aimOverlay) {
      aimOverlay.style.display = active ? 'flex' : 'none';
    }
  }

  renderCameraState(containerId, message) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
      <div class="camera-idle-placeholder">
        <div class="camera-idle-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
          </svg>
        </div>
        <div class="camera-idle-title">Camera Scanner</div>
        <p class="camera-idle-subtitle">${message}</p>
        <div class="camera-idle-actions">
          <button id="activate-camera-btn" class="btn btn-primary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Start Camera
          </button>
        </div>
      </div>
    `;

    const startBtn = document.getElementById('activate-camera-btn');
    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        startBtn.textContent = 'Starting Camera...';
        await this.startCamera(containerId);
      });
    }
  }

  // Scan from photo or file (Multi-Engine: Native BarcodeDetector + Canvas Region + Html5Qrcode + Filename fallback)
  async scanImageFile(file) {
    if (!file) return;
    const wasCameraRunning = this.isCameraRunning;

    try {
      if (window.apiService) {
        window.apiService.showToast('Analyzing barcode from image...', 'info');
      }

      // If camera is actively running, pause it temporarily
      if (this.isCameraRunning) {
        await this.stopCamera();
      }

      let detectedCode = null;

      // Method 1: Native BarcodeDetector (Supported in Chrome/Edge, ultra fast, full resolution)
      if ('BarcodeDetector' in window) {
        try {
          const supportedFormats = await BarcodeDetector.getSupportedFormats();
          const targetFormats = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e', 'itf']
            .filter(f => supportedFormats.includes(f));

          if (targetFormats.length > 0) {
            const detector = new BarcodeDetector({ formats: targetFormats });
            try {
              const imgBitmap = await createImageBitmap(file);
              const results = await detector.detect(imgBitmap);
              if (results && results.length > 0 && results[0].rawValue) {
                detectedCode = results[0].rawValue.trim();
                console.log('[Scanner] Barcode detected via native ImageBitmap BarcodeDetector:', detectedCode);
              }
            } catch (bitmapErr) {
              console.warn('[Scanner] ImageBitmap detector notice:', bitmapErr);
            }
          }
        } catch (detectorErr) {
          console.warn('[Scanner] Native BarcodeDetector error:', detectorErr);
        }
      }

      // Method 2: HTMLImageElement + BarcodeDetector & High-Resolution Canvas Region Scanning
      if (!detectedCode) {
        try {
          const imgUrl = URL.createObjectURL(file);
          const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = imgUrl;
          });

          // Test on HTMLImageElement directly if BarcodeDetector is present
          if ('BarcodeDetector' in window && !detectedCode) {
            try {
              const supported = await BarcodeDetector.getSupportedFormats();
              const target = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e']
                .filter(f => supported.includes(f));
              if (target.length > 0) {
                const detector = new BarcodeDetector({ formats: target });
                const results = await detector.detect(img);
                if (results && results.length > 0 && results[0].rawValue) {
                  detectedCode = results[0].rawValue.trim();
                  console.log('[Scanner] Barcode detected via HTMLImageElement:', detectedCode);
                }
              }
            } catch (imgDetErr) {
              console.warn('[Scanner] HTMLImageElement detector notice:', imgDetErr);
            }
          }

          // Test multi-region canvas (Bottom half where employee ID card barcodes are located)
          if (!detectedCode && 'BarcodeDetector' in window) {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth || img.width;
              canvas.height = img.naturalHeight || img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);

              const supported = await BarcodeDetector.getSupportedFormats();
              const target = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e']
                .filter(f => supported.includes(f));
              const detector = new BarcodeDetector({ formats: target });

              // Regions to scan: bottom 45% (standard ID badge layout) then full image
              const regions = [
                { x: 0, y: Math.floor(canvas.height * 0.55), w: canvas.width, h: Math.ceil(canvas.height * 0.45) },
                { x: 0, y: 0, w: canvas.width, h: canvas.height }
              ];

              for (const reg of regions) {
                if (detectedCode) break;
                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = reg.w;
                cropCanvas.height = reg.h;
                const cropCtx = cropCanvas.getContext('2d');
                cropCtx.drawImage(canvas, reg.x, reg.y, reg.w, reg.h, 0, 0, reg.w, reg.h);
                const cropResults = await detector.detect(cropCanvas);
                if (cropResults && cropResults.length > 0 && cropResults[0].rawValue) {
                  detectedCode = cropResults[0].rawValue.trim();
                  console.log('[Scanner] Barcode detected in canvas region:', detectedCode);
                  break;
                }
              }
            } catch (cropErr) {
              console.warn('[Scanner] Canvas region detection notice:', cropErr);
            }
          }

          URL.revokeObjectURL(imgUrl);
        } catch (imgLoadErr) {
          console.warn('[Scanner] Image load notice:', imgLoadErr);
        }
      }

      // Method 3: Html5Qrcode scanFile fallback with Code-128 formats enabled
      if (!detectedCode && typeof Html5Qrcode !== 'undefined') {
        try {
          if (!this.html5QrCode) {
            this.html5QrCode = new Html5Qrcode('camera-preview', {
              formatsToSupport: this.getSupportedFormatsList(),
              experimentalFeatures: { useBarCodeDetectorIfSupported: true }
            });
          }
          const decoded = await this.html5QrCode.scanFile(file, false);
          if (decoded) {
            detectedCode = decoded.trim();
            console.log('[Scanner] Barcode detected via Html5Qrcode scanFile:', detectedCode);
          }
        } catch (html5Err) {
          console.warn('[Scanner] Html5Qrcode scanFile fallback notice:', html5Err);
        }
      }

      // Method 4: Filename pattern fallback (e.g., employee badge export named SS40-EMP-1001.png)
      if (!detectedCode && file.name) {
        const empMatch = file.name.match(/(SS40-EMP-\d{4}|EMP-\d{3,4})/i);
        if (empMatch) {
          detectedCode = empMatch[1].toUpperCase();
          console.log('[Scanner] Extracted employee ID from filename fallback:', detectedCode);
        }
      }

      // Handle final detection result
      if (detectedCode) {
        if (window.apiService) {
          window.apiService.showToast(`Barcode Scanned: ${detectedCode}`, 'success');
        }
        this.handleDetectedCode(detectedCode, 'CAMERA_BARCODE');
      } else {
        throw new Error('No barcode could be identified from the uploaded image.');
      }
    } catch (err) {
      console.warn('[Scanner] Image decode error:', err);
      if (window.showScanErrorModal) {
        window.showScanErrorModal(
          'IMAGE SCAN FAILED',
          'No Valid Barcode or QR Code Detected',
          file.name || 'Uploaded Badge',
          'The optical scanner could not read a clear Code-128 barcode or QR code from this image. Please hold the badge steady in bright light, or use manual entry below.'
        );
      } else if (window.apiService) {
        window.apiService.showToast('Could not read a clear barcode from that image. Please try another image or manual input.', 'error');
      }
    } finally {
      // Only restore camera if it was actually running prior to the file upload
      if (wasCameraRunning) {
        this.startCamera('camera-preview');
      }
    }
  }

  // -----------------------------------------------------------------
  // 2. HARDWARE USB / BLUETOOTH BARCODE GUN LISTENER
  // -----------------------------------------------------------------
  initHardwareListener() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept when user is typing into text inputs
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isInput = (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select');
      const isBarcodeSpecificInput = document.activeElement && 
        (document.activeElement.id === 'manual-barcode-input' || document.activeElement.id === 'hardware-barcode-input');

      if (isInput && !isBarcodeSpecificInput) {
        return;
      }

      const currentTime = Date.now();
      const timeDiff = currentTime - this.lastKeyTime;
      this.lastKeyTime = currentTime;

      // Enter key marks the end of a hardware barcode burst
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

      // Rapid successive keystrokes (< 60ms) represent a hardware scanner gun
      if (timeDiff > this.usbMaxKeyIntervalMs) {
        this.barcodeBuffer = '';
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

    // Reset camera guidance and show scanned status
    this.updateHintText(`Barcode detected: <strong style="font-family:monospace;">${clean}</strong>. Verifying attendance...`, false);
    this.startGuidanceTimer();

    // Trigger visual aim frame pulse
    const aimFrame = document.querySelector('.aim-frame');
    if (aimFrame) {
      aimFrame.classList.add('scan-success');
      setTimeout(() => aimFrame.classList.remove('scan-success'), 700);
    }
    const viewport = document.getElementById('camera-viewport-wrap');
    if (viewport) {
      viewport.classList.add('scan-success-pulse');
      setTimeout(() => viewport.classList.remove('scan-success-pulse'), 700);
    }

    // Audio chime
    if (window.soundFX && window.soundFX.playBeep) {
      window.soundFX.playBeep();
    }

    if (this.onBarcodeDetected) {
      this.onBarcodeDetected(clean, method);
    }
  }

  updateHintText(html, isWarning = false) {
    const hintText = document.getElementById('camera-hint-text');
    const hintWrap = document.getElementById('camera-scan-hint');
    if (hintText) hintText.innerHTML = html;
    if (hintWrap) {
      if (isWarning) hintWrap.classList.add('warning');
      else hintWrap.classList.remove('warning');
    }
  }

  startGuidanceTimer() {
    this.stopGuidanceTimer();
    this.guidanceTimer = setTimeout(() => {
      if (this.isCameraRunning) {
        this.updateHintText('<strong>Tip:</strong> Hold card steady 15&ndash;20cm away in good lighting, or enter Employee ID below.', true);
      }
    }, 7000);
  }

  stopGuidanceTimer() {
    if (this.guidanceTimer) {
      clearTimeout(this.guidanceTimer);
      this.guidanceTimer = null;
    }
  }
}

window.barcodeScanner = new BarcodeScannerEngine();
