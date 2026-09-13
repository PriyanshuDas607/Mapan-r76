/**
 * Real-Time Environmental Data & Geolocation Service
 * Standard: ISO/IEC 17025 (Clause 6.3) & OIML R 76-1:2006 (Clause 3.9.2, Clause A.4.1.2)
 *
 * Utilizes 100% Lifetime-Free, Keyless APIs:
 *   1. W3C Geolocation API (Browser GPS / Network Location)
 *   2. IP-based Geolocation Fallback (ipwho.is / bigdatacloud - Lifetime Free, No Key)
 *   3. Open-Meteo Weather API (Open-Meteo.com - 100% Lifetime Free, No API Key Required)
 */

export interface EnvironmentalData {
  temperature: string      // e.g. "23.4 °C"
  temperatureValue: number // 23.4
  humidity: string         // e.g. "52.0 % RH"
  humidityValue: number    // 52.0
  pressure: string         // e.g. "1012.8 hPa"
  pressureValue: number    // 1012.8
  locationName: string     // e.g. "New Delhi, IN"
  latitude?: number
  longitude?: number
  airDensity: string       // e.g. "1.189 kg/m³" (CIPM formula for Class I/II balances)
  airDensityValue: number  // 1.189
  isWithinOIMLLimits: boolean // OIML R-76 Clause 3.9.2.1 (-10°C to +40°C)
  warning?: string
  source: 'GPS_LIVE' | 'IP_GEO' | 'FALLBACK'
  timestamp: string
}

/**
 * Computes Air Density (rho_air in kg/m³) using simplified CIPM formula for Legal Metrology.
 * Used for air buoyancy evaluation in Class I & Class II weighing instruments.
 *
 * @param T Temperature in °C
 * @param RH Relative Humidity in % (0 - 100)
 * @param P Barometric Pressure in hPa
 */
export function calculateAirDensity(T: number, RH: number, P: number): number {
  if (P <= 0 || T < -50 || T > 100) return 1.200 // default standard STP air density
  // CIPM approximation: rho = (0.34848*P - 0.009*RH*exp(0.061*T)) / (273.15 + T)
  const numerator = 0.34848 * P - 0.009 * RH * Math.exp(0.061 * T)
  const denominator = 273.15 + T
  const rho = numerator / denominator
  return Number(rho.toFixed(4))
}

/**
 * Fetches real-time environmental observations from Open-Meteo (100% Free Lifetime API)
 */
async function fetchOpenMeteoData(lat: number, lon: number, locationName: string, source: 'GPS_LIVE' | 'IP_GEO'): Promise<EnvironmentalData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure`
  
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!response.ok) {
    throw new Error(`Open-Meteo API returned status ${response.status}`)
  }

  const data = await response.json()
  const temp = data.current?.temperature_2m ?? 22.0
  const rh = data.current?.relative_humidity_2m ?? 50.0
  const pres = data.current?.surface_pressure ?? 1013.25

  const airDensityVal = calculateAirDensity(temp, rh, pres)
  const isWithinOIMLLimits = temp >= -10 && temp <= 40
  const warning = !isWithinOIMLLimits
    ? `Ambient Temperature (${temp.toFixed(1)}°C) exceeds standard OIML R-76 Clause 3.9.2.1 limits (-10°C to +40°C).`
    : undefined

  return {
    temperature: `${temp.toFixed(1)} °C`,
    temperatureValue: temp,
    humidity: `${rh.toFixed(1)} % RH`,
    humidityValue: rh,
    pressure: `${pres.toFixed(1)} hPa`,
    pressureValue: pres,
    locationName,
    latitude: lat,
    longitude: lon,
    airDensity: `${airDensityVal.toFixed(3)} kg/m³`,
    airDensityValue: airDensityVal,
    isWithinOIMLLimits,
    warning,
    source,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Fallback to IP-based Geolocation using keyless free services
 */
async function fetchIPGeolocation(): Promise<{ lat: number; lon: number; city: string }> {
  try {
    const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const data = await res.json()
      if (data.success !== false && data.latitude && data.longitude) {
        return {
          lat: data.latitude,
          lon: data.longitude,
          city: `${data.city || 'Testing Bay'}, ${data.country_code || 'IN'}`,
        }
      }
    }
  } catch {
    // try secondary keyless reverse geocoder
  }

  try {
    const res2 = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client', { signal: AbortSignal.timeout(4000) })
    if (res2.ok) {
      const data2 = await res2.json()
      if (data2.latitude && data2.longitude) {
        return {
          lat: data2.latitude,
          lon: data2.longitude,
          city: `${data2.city || data2.locality || 'Central Standards Lab'}, ${data2.countryCode || 'IN'}`,
        }
      }
    }
  } catch {
    // default fallback coordinates
  }

  return { lat: 28.6139, lon: 77.2090, city: 'National Metrology Lab, New Delhi' }
}

/**
 * Main auto-fetch function for Test Workspaces.
 * Combines Browser GPS -> IP Fallback -> Open-Meteo Weather API.
 */
export async function autoFetchEnvironmentalData(): Promise<EnvironmentalData> {
  // 1. Try Browser Geolocation API first
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
          { timeout: 4000, enableHighAccuracy: false, maximumAge: 60000 }
        )
      })

      let locationName = `GPS (${coords.latitude.toFixed(2)}°N, ${coords.longitude.toFixed(2)}°E)`
      try {
        const rev = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}`,
          { signal: AbortSignal.timeout(3000) }
        )
        if (rev.ok) {
          const revData = await rev.json()
          const locality = revData.locality || revData.city || revData.principalSubdivision
          if (locality) {
            locationName = `${locality}, ${revData.countryCode || 'IN'} [GPS]`
          }
        }
      } catch {
        // Fallback to GPS coordinate string
      }

      return await fetchOpenMeteoData(coords.latitude, coords.longitude, locationName, 'GPS_LIVE')
    } catch {
      // Geolocation denied or timed out; proceed to IP fallback
    }
  }

  // 2. IP Geolocation Fallback
  try {
    const ipGeo = await fetchIPGeolocation()
    return await fetchOpenMeteoData(ipGeo.lat, ipGeo.lon, ipGeo.city, 'IP_GEO')
  } catch {
    // 3. Static safe defaults if network is fully offline
    return {
      temperature: '21.5 °C',
      temperatureValue: 21.5,
      humidity: '48.0 % RH',
      humidityValue: 48.0,
      pressure: '1013.2 hPa',
      pressureValue: 1013.2,
      locationName: 'Central Standards Lab - Calibration Bay 04',
      airDensity: '1.196 kg/m³',
      airDensityValue: 1.196,
      isWithinOIMLLimits: true,
      source: 'FALLBACK',
      timestamp: new Date().toISOString(),
    }
  }
}
