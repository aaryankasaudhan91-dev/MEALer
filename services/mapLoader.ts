
import { reverseGeocode } from './geminiService';

export interface ReverseGeocodeResult {
  line1: string;
  line2: string;
  landmark?: string;
  pincode: string;
}

// Switched to Gemini for reliable geocoding without rate limits/CORS issues
// This replaces the previous fetch implementation that was failing
export const reverseGeocodeGoogle = async (lat: number, lng: number): Promise<ReverseGeocodeResult | null> => {
  return await reverseGeocode(lat, lng);
};

// Legacy stub to prevent build errors if referenced elsewhere
export const loadGoogleMaps = (): Promise<void> => {
    return Promise.resolve();
};

// Central Location Fetching Utility with Fallback and Timeout
export const getCurrentLocation = (): Promise<{lat: number, lng: number}> => {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation is not supported by your browser."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => {
                let errorMessage = "Unable to retrieve your location.";
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = "Location access denied. Please enable location permissions.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = "Location information is currently unavailable.";
                        break;
                    case error.TIMEOUT:
                        errorMessage = "Location request timed out. Please check your signal and try again.";
                        break;
                }
                reject(new Error(errorMessage));
            },
            {
                enableHighAccuracy: true,
                timeout: 10000, 
                maximumAge: 5 * 60 * 1000 // Cache for 5 minutes
            }
        );
    });
};
