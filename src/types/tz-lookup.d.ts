declare module "tz-lookup" {
  /** Returns an IANA timezone name (e.g., "America/Chicago") for the given lat/lng. */
  export default function tzlookup(lat: number, lng: number): string;
}
