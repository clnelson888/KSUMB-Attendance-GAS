/** @OnlyCurrentDoc */

/**
 * All section tab names in the attendance spreadsheet.
 * Each entry corresponds to a sheet tab and a section in the Database.
 */
const SECTION_TABS = [
  "Piccolo",
  "Clarinet",
  "Alto Sax",
  "Tenor Sax",
  "Trumpet",
  "Horn",
  "Trombone",
  "Baritone",
  "Tuba",
  "Percussion",
  "Classy Cats",
  "Color Guard",
  "Twirlers",
  "Drum Majors",
  "Student Staff",
];

/**
 * Memoized config cache. Reset each GAS execution.
 * @type {Object.<string, string>|null}
 */
let _configCache = null;

/**
 * Reads key/value pairs from the Data tab and returns them as an object.
 * Memoized for the duration of a single GAS execution.
 *
 * Expects columns: Key (col A), Value (col B).
 *
 * @returns {Object.<string, string>} Config map, e.g. { REHEARSAL_START_TIME: '15:15' }
 */
function getConfig() {
  if (_configCache) return _configCache;

  const data = getTableData("Data");
  const config = {};

  for (let i = 1; i < data.length; i++) {
    const key = data[i][0];
    const value = data[i][1];
    if (key) {
      config[String(key).trim()] = value;
    }
  }

  _configCache = config;
  return config;
}
