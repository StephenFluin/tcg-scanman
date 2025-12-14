import { Injectable, signal } from '@angular/core';

/**
 * Service to manage camera access, streaming, and device selection
 */
@Injectable({
  providedIn: 'root',
})
export class CameraService {
  private readonly STORAGE_KEY = 'tcg-scanman-camera-id';

  // Signals for reactive state
  readonly stream = signal<MediaStream | null>(null);
  readonly devices = signal<MediaDeviceInfo[]>([]);
  readonly selectedDeviceId = signal<string | null>(null);
  readonly permissionGranted = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  constructor() {
    // Load saved camera preference
    const savedDeviceId = localStorage.getItem(this.STORAGE_KEY);
    if (savedDeviceId) {
      this.selectedDeviceId.set(savedDeviceId);
    }

    // Auto-check permissions on initialization
    this.checkExistingPermissions();
  }

  /**
   * Check if camera permissions are already granted and auto-start
   */
  private async checkExistingPermissions(): Promise<void> {
    try {
      // Check if mediaDevices API is available first
      if (!navigator.mediaDevices) {
        console.warn('MediaDevices API not available. Site must be served over HTTPS.');
        return;
      }

      // Check if Permissions API is available
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({
          name: 'camera' as PermissionName,
        });

        if (permissionStatus.state === 'granted') {
          // Permissions already granted, start automatically
          await this.requestPermissions();
        }
      } else {
        // Fallback: Try to enumerate devices to check permissions
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasVideoDevices = devices.some(
          (device) => device.kind === 'videoinput' && device.label !== ''
        );

        if (hasVideoDevices) {
          // If we can see device labels, permissions are granted
          await this.requestPermissions();
        }
      }
    } catch (err) {
      // Permissions not granted yet, user will need to click button
      console.log('Camera permissions not yet granted');
    }
  }

  /**
   * Request camera permissions and enumerate available devices
   */
  async requestPermissions(): Promise<boolean> {
    try {
      this.error.set(null);

      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available. Please use HTTPS or a supported browser.');
      }

      // Request initial permission with any camera
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      // Stop the temporary stream
      tempStream.getTracks().forEach((track) => track.stop());

      this.permissionGranted.set(true);

      // Now enumerate devices
      await this.enumerateDevices();

      // Start stream with saved or first device
      const deviceId = this.selectedDeviceId() || this.devices()[0]?.deviceId;
      if (deviceId) {
        await this.selectCamera(deviceId);
      }

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to access camera';
      this.error.set(errorMessage);
      this.permissionGranted.set(false);
      console.error('Camera permission error:', err);
      return false;
    }
  }

  /**
   * Enumerate available video input devices
   */
  private async enumerateDevices(): Promise<void> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        throw new Error('Device enumeration not available');
      }
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter((device) => device.kind === 'videoinput');
      this.devices.set(videoDevices);
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
      this.devices.set([]);
    }
  }

  /**
   * Select and start streaming from a specific camera
   */
  async selectCamera(deviceId: string): Promise<void> {
    try {
      this.error.set(null);

      // Stop current stream if any
      this.stopStream();

      // Start new stream with 1080p resolution and stable focus
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          facingMode: 'environment', // Prefer back camera on mobile
          // Focus settings to prevent thrashing
          // @ts-ignore - focusMode not in standard types yet
          focusMode: 'continuous',
          // @ts-ignore - advanced constraints not in standard types
          advanced: [
            // @ts-ignore
            { focusMode: 'continuous' },
            // @ts-ignore
            { focusDistance: { ideal: 0.5 } }, // Focus at medium distance
          ],
        },
      };

      console.log('📷 Requesting camera with 1920x1080 resolution');

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Log the actual resolution we got
      const videoTrack = newStream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        console.log(
          `✅ Camera started: ${settings.width}x${settings.height} at ${settings.frameRate}fps`
        );

        // Try to apply focus constraints after stream starts
        try {
          await videoTrack.applyConstraints({
            // @ts-ignore - advanced camera features
            advanced: [{ focusMode: 'continuous' }],
          });
          console.log('📷 Applied continuous focus mode');
        } catch (focusErr) {
          console.log('ℹ️  Focus mode not supported on this device');
        }
      }

      this.stream.set(newStream);
      this.selectedDeviceId.set(deviceId);

      // Save preference to localStorage
      localStorage.setItem(this.STORAGE_KEY, deviceId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to select camera';
      this.error.set(errorMessage);
      throw err;
    }
  }

  /**
   * Stop the current video stream
   */
  stopStream(): void {
    const currentStream = this.stream();
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
      this.stream.set(null);
    }
  }

  /**
   * Get the next available camera (for cycling through cameras)
   */
  async selectNextCamera(): Promise<void> {
    const currentDevices = this.devices();
    const currentDeviceId = this.selectedDeviceId();

    if (currentDevices.length === 0) {
      return;
    }

    const currentIndex = currentDevices.findIndex((d) => d.deviceId === currentDeviceId);
    const nextIndex = (currentIndex + 1) % currentDevices.length;
    const nextDevice = currentDevices[nextIndex];

    if (nextDevice) {
      await this.selectCamera(nextDevice.deviceId);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopStream();
  }
}
