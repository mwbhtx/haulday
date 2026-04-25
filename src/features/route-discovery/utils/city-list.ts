/**
 * Curated list of major US cities for the Route Discovery location autocomplete.
 * Roughly the top ~250 by population + freight-relevant secondary markets
 * (intermodal hubs, port cities, distribution centers). Format: `City, ST`.
 *
 * Not exhaustive — users can still type any free-text "City, ST" and the
 * backend's zipcodes lookup handles small-town resolution. This list just
 * powers the datalist suggestions to make common entries one keystroke away.
 */
export const US_CITIES: ReadonlyArray<string> = [
  // TX (heavy presence — port + interior freight)
  "Houston, TX", "Dallas, TX", "Fort Worth, TX", "San Antonio, TX", "Austin, TX",
  "El Paso, TX", "Arlington, TX", "Corpus Christi, TX", "Plano, TX", "Lubbock, TX",
  "Laredo, TX", "Garland, TX", "Irving, TX", "Amarillo, TX", "Grand Prairie, TX",
  "Brownsville, TX", "Beaumont, TX", "Killeen, TX", "Waco, TX", "McAllen, TX",
  "Mesquite, TX", "Midland, TX", "Pasadena, TX", "Carrollton, TX", "Denton, TX",
  "Abilene, TX", "Round Rock, TX", "Sealy, TX", "Conroe, TX", "Stafford, TX",
  "Katy, TX", "La Porte, TX", "Galveston, TX", "Tyler, TX", "College Station, TX",
  "Bryan, TX", "San Angelo, TX", "Odessa, TX", "Texas City, TX", "Lewisville, TX",

  // CA
  "Los Angeles, CA", "San Diego, CA", "San Jose, CA", "San Francisco, CA",
  "Fresno, CA", "Sacramento, CA", "Long Beach, CA", "Oakland, CA", "Bakersfield, CA",
  "Anaheim, CA", "Stockton, CA", "Riverside, CA", "Santa Ana, CA", "Irvine, CA",
  "Chula Vista, CA", "Fremont, CA", "San Bernardino, CA", "Modesto, CA",
  "Fontana, CA", "Oxnard, CA", "Moreno Valley, CA", "Glendale, CA", "Huntington Beach, CA",
  "Ontario, CA", "Rancho Cucamonga, CA", "Oceanside, CA",

  // FL
  "Jacksonville, FL", "Miami, FL", "Tampa, FL", "Orlando, FL", "St. Petersburg, FL",
  "Hialeah, FL", "Tallahassee, FL", "Fort Lauderdale, FL", "Cape Coral, FL",
  "Pembroke Pines, FL", "Hollywood, FL", "Gainesville, FL", "Miramar, FL",
  "Coral Springs, FL", "Lakeland, FL", "Pompano Beach, FL", "Clearwater, FL",
  "West Palm Beach, FL", "Palm Bay, FL", "Miami Gardens, FL",

  // GA
  "Atlanta, GA", "Augusta, GA", "Columbus, GA", "Macon, GA", "Savannah, GA",
  "Athens, GA", "Sandy Springs, GA", "Roswell, GA", "Albany, GA", "Johns Creek, GA",
  "Warner Robins, GA", "Alpharetta, GA",

  // NC
  "Charlotte, NC", "Raleigh, NC", "Greensboro, NC", "Durham, NC", "Winston-Salem, NC",
  "Fayetteville, NC", "Cary, NC", "Wilmington, NC", "High Point, NC", "Greenville, NC",

  // VA
  "Virginia Beach, VA", "Norfolk, VA", "Chesapeake, VA", "Richmond, VA",
  "Newport News, VA", "Alexandria, VA", "Hampton, VA", "Roanoke, VA",

  // PA
  "Philadelphia, PA", "Pittsburgh, PA", "Allentown, PA", "Erie, PA", "Reading, PA",
  "Scranton, PA", "Harrisburg, PA", "Lancaster, PA", "Bethlehem, PA",

  // OH
  "Columbus, OH", "Cleveland, OH", "Cincinnati, OH", "Toledo, OH", "Akron, OH",
  "Dayton, OH", "Parma, OH", "Canton, OH", "Youngstown, OH",

  // IL
  "Chicago, IL", "Aurora, IL", "Naperville, IL", "Joliet, IL", "Rockford, IL",
  "Springfield, IL", "Elgin, IL", "Peoria, IL", "Champaign, IL",

  // IN
  "Indianapolis, IN", "Fort Wayne, IN", "Evansville, IN", "South Bend, IN",
  "Carmel, IN", "Fishers, IN", "Bloomington, IN", "Hammond, IN", "Gary, IN",

  // TN
  "Memphis, TN", "Nashville, TN", "Knoxville, TN", "Chattanooga, TN", "Clarksville, TN",
  "Murfreesboro, TN", "Franklin, TN", "Jackson, TN",

  // MO
  "Kansas City, MO", "St. Louis, MO", "Springfield, MO", "Columbia, MO",
  "Independence, MO", "Lee's Summit, MO", "O'Fallon, MO",

  // AZ
  "Phoenix, AZ", "Tucson, AZ", "Mesa, AZ", "Chandler, AZ", "Scottsdale, AZ",
  "Glendale, AZ", "Gilbert, AZ", "Tempe, AZ", "Peoria, AZ", "Surprise, AZ",
  "Yuma, AZ",

  // CO
  "Denver, CO", "Colorado Springs, CO", "Aurora, CO", "Fort Collins, CO",
  "Lakewood, CO", "Thornton, CO", "Arvada, CO", "Pueblo, CO",

  // WA
  "Seattle, WA", "Spokane, WA", "Tacoma, WA", "Vancouver, WA", "Bellevue, WA",
  "Kent, WA", "Everett, WA", "Renton, WA", "Yakima, WA",

  // OR
  "Portland, OR", "Salem, OR", "Eugene, OR", "Gresham, OR", "Hillsboro, OR",
  "Bend, OR", "Beaverton, OR", "Medford, OR",

  // NY / NJ
  "New York, NY", "Buffalo, NY", "Rochester, NY", "Yonkers, NY", "Syracuse, NY",
  "Albany, NY", "Newark, NJ", "Jersey City, NJ", "Paterson, NJ", "Elizabeth, NJ",
  "Edison, NJ", "Trenton, NJ",

  // MA / CT / RI
  "Boston, MA", "Worcester, MA", "Springfield, MA", "Cambridge, MA", "Lowell, MA",
  "Bridgeport, CT", "New Haven, CT", "Stamford, CT", "Hartford, CT",
  "Providence, RI", "Warwick, RI",

  // MI
  "Detroit, MI", "Grand Rapids, MI", "Warren, MI", "Sterling Heights, MI",
  "Ann Arbor, MI", "Lansing, MI", "Flint, MI", "Dearborn, MI",

  // WI / MN
  "Milwaukee, WI", "Madison, WI", "Green Bay, WI", "Kenosha, WI",
  "Minneapolis, MN", "St. Paul, MN", "Rochester, MN", "Duluth, MN", "Bloomington, MN",

  // OK / AR / LA / MS / AL
  "Oklahoma City, OK", "Tulsa, OK", "Norman, OK",
  "Little Rock, AR", "Fort Smith, AR", "Fayetteville, AR",
  "New Orleans, LA", "Baton Rouge, LA", "Shreveport, LA", "Lafayette, LA",
  "Jackson, MS", "Gulfport, MS",
  "Birmingham, AL", "Montgomery, AL", "Mobile, AL", "Huntsville, AL", "Tuscaloosa, AL",

  // KY / SC
  "Louisville, KY", "Lexington, KY", "Bowling Green, KY",
  "Charleston, SC", "Columbia, SC", "North Charleston, SC", "Mount Pleasant, SC",

  // NV / UT / NM
  "Las Vegas, NV", "Henderson, NV", "Reno, NV", "North Las Vegas, NV",
  "Salt Lake City, UT", "West Valley City, UT", "Provo, UT", "West Jordan, UT",
  "Albuquerque, NM", "Las Cruces, NM", "Santa Fe, NM",

  // KS / NE / IA
  "Wichita, KS", "Overland Park, KS", "Kansas City, KS", "Topeka, KS",
  "Omaha, NE", "Lincoln, NE",
  "Des Moines, IA", "Cedar Rapids, IA", "Davenport, IA",

  // ID / MT / WY / ND / SD
  "Boise, ID", "Idaho Falls, ID", "Nampa, ID",
  "Billings, MT", "Missoula, MT",
  "Cheyenne, WY", "Casper, WY",
  "Fargo, ND", "Bismarck, ND",
  "Sioux Falls, SD", "Rapid City, SD",

  // ME / NH / VT / WV / DE / MD / DC / AK / HI
  "Portland, ME", "Manchester, NH",
  "Burlington, VT",
  "Charleston, WV", "Huntington, WV", "Morgantown, WV",
  "Wilmington, DE", "Dover, DE",
  "Baltimore, MD", "Frederick, MD", "Rockville, MD",
  "Washington, DC",
  "Anchorage, AK", "Fairbanks, AK",
  "Honolulu, HI",
];

/**
 * Parse a "City, ST" string into separate fields.
 * Returns null if the format isn't recognized.
 */
export function parseCityState(input: string): { city: string; state: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(.+?),\s*([A-Za-z]{2})\s*$/);
  if (!match) return null;
  const city = match[1].trim();
  const state = match[2].toUpperCase();
  if (city.length < 2) return null;
  return { city, state };
}
