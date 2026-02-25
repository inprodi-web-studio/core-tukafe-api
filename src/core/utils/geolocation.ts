export interface GeolocationData {
  city: string | null;
  country: string | null;
}

export async function resolveGeolocation(
  ipAddress: string | null | undefined,
): Promise<GeolocationData> {
  if (!ipAddress || ipAddress === "127.0.0.1" || ipAddress === "::1" || ipAddress === "localhost") {
    return { city: null, country: null };
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${ipAddress}?fields=city,country`);

    if (!response.ok) {
      return { city: null, country: null };
    }

    const data = (await response.json()) as { city?: string; country?: string };

    return {
      city: data.city || null,
      country: data.country || null,
    };
  } catch (error) {
    return { city: null, country: null };
  }
}
