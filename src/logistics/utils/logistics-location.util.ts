export function formatLogisticsLocation(
  location?: string | null,
  country?: string | null,
): string | null {
  const place = location?.trim();
  const countryName = country?.trim();

  if (!place) return countryName || null;
  if (!countryName || place.toLowerCase().includes(countryName.toLowerCase())) {
    return place;
  }

  return `${place}, ${countryName}`;
}
