// ICAO aircraft type designators → silhouette class and a readable description.
// Descriptions are a fallback for providers (adsb.lol) that don't return `desc`.
// Hand-written for this project from public ICAO Doc 8643 designators.

/** Silhouette classes drawn in js/map/icons.js */
export const CLASSES = [
  'narrow', 'wide', 'regional', 'bizjet', 'turboprop', 'piston',
  'heli', 'fighter', 'milheavy', 'light',
];

const NAMES = {
  // Airbus
  A19N: 'Airbus A319neo', A20N: 'Airbus A320neo', A21N: 'Airbus A321neo', A318: 'Airbus A318',
  A319: 'Airbus A319', A320: 'Airbus A320', A321: 'Airbus A321', A332: 'Airbus A330-200',
  A333: 'Airbus A330-300', A338: 'Airbus A330-800neo', A339: 'Airbus A330-900neo',
  A359: 'Airbus A350-900', A35K: 'Airbus A350-1000', A388: 'Airbus A380-800', A306: 'Airbus A300-600',
  BCS1: 'Airbus A220-100', BCS3: 'Airbus A220-300', A400: 'Airbus A400M Atlas',
  // Boeing
  B712: 'Boeing 717-200', B732: 'Boeing 737-200', B733: 'Boeing 737-300', B734: 'Boeing 737-400',
  B735: 'Boeing 737-500', B736: 'Boeing 737-600', B737: 'Boeing 737-700', B738: 'Boeing 737-800',
  B739: 'Boeing 737-900', B37M: 'Boeing 737 MAX 7', B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9',
  B3XM: 'Boeing 737 MAX 10', B752: 'Boeing 757-200', B753: 'Boeing 757-300', B762: 'Boeing 767-200',
  B763: 'Boeing 767-300', B764: 'Boeing 767-400', B744: 'Boeing 747-400', B748: 'Boeing 747-8',
  B772: 'Boeing 777-200', B77L: 'Boeing 777-200LR', B773: 'Boeing 777-300', B77W: 'Boeing 777-300ER',
  B778: 'Boeing 777-8', B779: 'Boeing 777-9', B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10',
  MD11: 'McDonnell Douglas MD-11', DC10: 'McDonnell Douglas DC-10', MD88: 'McDonnell Douglas MD-88',
  // Regional
  CRJ2: 'Bombardier CRJ200', CRJ7: 'Bombardier CRJ700', CRJ9: 'Bombardier CRJ900', CRJX: 'Bombardier CRJ1000',
  E135: 'Embraer ERJ-135', E145: 'Embraer ERJ-145', E170: 'Embraer E170', E75L: 'Embraer E175',
  E75S: 'Embraer E175', E190: 'Embraer E190', E195: 'Embraer E195', E290: 'Embraer E190-E2', E295: 'Embraer E195-E2',
  // Turboprops
  AT72: 'ATR 72', AT76: 'ATR 72-600', AT45: 'ATR 42-500', DH8D: 'De Havilland Dash 8-400',
  DH8A: 'De Havilland Dash 8-100', B350: 'Beechcraft King Air 350', BE20: 'Beechcraft King Air 200',
  BE9L: 'Beechcraft King Air 90', BE30: 'Beechcraft King Air 300', B190: 'Beechcraft 1900',
  PC12: 'Pilatus PC-12', PC21: 'Pilatus PC-21', TBM7: 'Daher TBM 700', TBM9: 'Daher TBM 900',
  C208: 'Cessna 208 Caravan', SW4: 'Fairchild Metro', TEX2: 'Beechcraft T-6 Texan II', T6: 'Beechcraft T-6 Texan II',
  C130: 'Lockheed C-130 Hercules', C30J: 'Lockheed Martin C-130J Super Hercules', C27J: 'Alenia C-27J Spartan',
  CN35: 'CASA CN-235', C295: 'Airbus C295', E2: 'Northrop Grumman E-2 Hawkeye', P3: 'Lockheed P-3 Orion',
  V22: 'Bell Boeing V-22 Osprey', AN12: 'Antonov An-12',
  // Bizjets
  C25A: 'Cessna Citation CJ2', C25B: 'Cessna Citation CJ3', C25C: 'Cessna Citation CJ4', C510: 'Cessna Citation Mustang',
  C525: 'Cessna CitationJet', C550: 'Cessna Citation II', C560: 'Cessna Citation V', C56X: 'Cessna Citation Excel',
  C680: 'Cessna Citation Sovereign', C68A: 'Cessna Citation Latitude', C700: 'Cessna Citation Longitude',
  C750: 'Cessna Citation X', CL30: 'Bombardier Challenger 300', CL35: 'Bombardier Challenger 350',
  CL60: 'Bombardier Challenger 600', GL5T: 'Bombardier Global 5000', GLEX: 'Bombardier Global Express',
  GL7T: 'Bombardier Global 7500', GLF4: 'Gulfstream IV', GLF5: 'Gulfstream V', GLF6: 'Gulfstream G650',
  G280: 'Gulfstream G280', GA5C: 'Gulfstream G500', GA6C: 'Gulfstream G600', LJ35: 'Learjet 35',
  LJ45: 'Learjet 45', LJ60: 'Learjet 60', LJ75: 'Learjet 75', E55P: 'Embraer Phenom 300', E50P: 'Embraer Phenom 100',
  FA7X: 'Dassault Falcon 7X', F900: 'Dassault Falcon 900', F2TH: 'Dassault Falcon 2000', HDJT: 'Honda HondaJet',
  PC24: 'Pilatus PC-24', SF50: 'Cirrus Vision Jet',
  // Piston
  C150: 'Cessna 150', C152: 'Cessna 152', C172: 'Cessna 172 Skyhawk', C182: 'Cessna 182 Skylane',
  C206: 'Cessna 206', C210: 'Cessna 210', P28A: 'Piper PA-28 Cherokee', P28R: 'Piper PA-28R Arrow',
  PA32: 'Piper PA-32', PA34: 'Piper Seneca', PA44: 'Piper Seminole', PA46: 'Piper Malibu',
  SR20: 'Cirrus SR20', SR22: 'Cirrus SR22', S22T: 'Cirrus SR22T', BE35: 'Beechcraft Bonanza',
  BE36: 'Beechcraft Bonanza', BE58: 'Beechcraft Baron', DA40: 'Diamond DA40', DA42: 'Diamond DA42',
  DA62: 'Diamond DA62', M20P: 'Mooney M20', RV7: 'Van\'s RV-7', RV10: 'Van\'s RV-10',
  // Helicopters
  H60: 'Sikorsky H-60 Black Hawk', H64: 'Boeing AH-64 Apache', H47: 'Boeing CH-47 Chinook',
  H53S: 'Sikorsky CH-53E Super Stallion', H72: 'Airbus UH-72 Lakota', EC35: 'Airbus H135', EC45: 'Airbus H145',
  EC30: 'Airbus H130', AS50: 'Airbus AS350 Écureuil', AS65: 'Airbus AS365 Dauphin', A109: 'Leonardo AW109',
  A119: 'Leonardo AW119 Koala', A139: 'Leonardo AW139', B06: 'Bell 206 JetRanger', B407: 'Bell 407',
  B429: 'Bell 429', B212: 'Bell 212', B412: 'Bell 412', R22: 'Robinson R22', R44: 'Robinson R44',
  R66: 'Robinson R66', S76: 'Sikorsky S-76', S92: 'Sikorsky S-92', UH1: 'Bell UH-1 Iroquois', NH90: 'NHIndustries NH90',
  // Fighters / trainers / attack
  F35: 'Lockheed Martin F-35 Lightning II', F16: 'General Dynamics F-16 Fighting Falcon', F15: 'Boeing F-15 Eagle',
  F18H: 'Boeing F/A-18 Hornet', F18S: 'Boeing F/A-18E/F Super Hornet', F22: 'Lockheed Martin F-22 Raptor',
  A10: 'Fairchild Republic A-10 Thunderbolt II', T38: 'Northrop T-38 Talon', T7: 'Boeing T-7 Red Hawk',
  HAWK: 'BAE Systems Hawk / T-45 Goshawk', AV8B: 'McDonnell Douglas AV-8B Harrier II', EUFI: 'Eurofighter Typhoon',
  // Military heavies
  C17: 'Boeing C-17 Globemaster III', C5M: 'Lockheed C-5M Super Galaxy', K35R: 'Boeing KC-135R Stratotanker',
  K35E: 'Boeing KC-135E Stratotanker', K46: 'Boeing KC-46A Pegasus', B52: 'Boeing B-52 Stratofortress',
  B1: 'Rockwell B-1 Lancer', B2: 'Northrop B-2 Spirit', E3TF: 'Boeing E-3 Sentry', E3CF: 'Boeing E-3 Sentry',
  E6: 'Boeing E-6 Mercury', E737: 'Boeing E-7 Wedgetail', P8: 'Boeing P-8 Poseidon', R135: 'Boeing RC-135',
  // Other
  GLID: 'Glider', BALL: 'Balloon', ULAC: 'Ultralight', TWR: 'Ground vehicle / tower', Q4: 'Northrop Grumman MQ-4C Triton',
  Q9: 'General Atomics MQ-9 Reaper',
};

const FAMILY = [
  [/^(F35|F16|F15|F18[HS]?|F22|A10|T38|T7|HAWK|AV8B|EUFI|F5|F4|F14|MIR2|RFAL|GRIF|SU\d+|MG\d+|L39|M346|T50)$/, 'fighter'],
  [/^(C17|C5M?|C130|C30J|K35[RE]|K46|KC10|B52|B1|B2|E3[TC]F|E6|E737|P8|R135|A400|C141|IL76|A124|AN12)$/, 'milheavy'],
  [/^(C25\w|C5[0-6]\w|C6\w\w|C7\d\d|CL\d\d|GL5T|GL6T|GL7T|GLEX|GLF\d|G\d{3}|GA\dC|LJ\d+|E5\dP|FA\w+|F900|F2TH|HDJT|PC24|SF50|E35L|E545|E550|ASTR|H25B|PRM1|BE40|WW24|EA50)$/, 'bizjet'],
  [/^(H\d+[A-Z]?|EC\d+|AS\d+|A1\d\d|B06|B4\d\d|B2\d\d|R22|R44|R66|S76|S92|UH1|NH90|H72|BK17|MI\d+|EH10|A169|A189|B505|AW\d+)$/, 'heli'],
  [/^(A38\d|B74\d|B77\w|B78\w|A33\d|A34\d|A35\w|B76\d|MD11|DC10|A30\d|A310|IL96|B74[RS])$/, 'wide'],
  [/^(CRJ\w|E1[34]5|E17\d|E75\w|E19\d|E29\d|BCS\d|F70|F100|RJ\d+|B46\d|SU95|AR\w\w)$/, 'regional'],
  [/^(A31\d|A32\d|A3[12]N|A2\dN|A19N|A20N|A21N|B73\d|B3[789X]M|B75\d|B71\d|MD8\d|MD90|DC9|C919|T204)$/, 'narrow'],
  [/^(AT\d\d|ATP|DH8\w|B350|BE\d0|BE9\w|B190|PC12|PC21|TBM\d|C208|SW\d|TEX2|T6|C130|C30J|C27J|CN35|C295|E2|P3|V22|AN\d\d|DHC\d|SF34|JS\d\d|L410|PC6|TUCA|G222|E120|D228|BE99)$/, 'turboprop'],
  [/^(C1\d\d|C2\d\d|C3\d\d|C4\d\d|P2\d\w|PA\d\d|SR2\d|S22T|BE3[3-6]|BE5\d|BE76|DA[24]\d|DA62|M20\w|RV\d+|AA5|CH7\w|J3|PA18|DR40|TB\d+)$/, 'piston'],
  [/^(GLID|BALL|ULAC|GYRO|TWR|GND|SHIP|Q\d)$/, 'light'],
];

/**
 * Pick a silhouette class from the ICAO type designator, falling back to the
 * ADS-B emitter category (A1 light … A5 heavy, A7 rotorcraft, B1 glider, B2 balloon…).
 */
export function classifyType(typeCode, category, military = false) {
  const t = (typeCode || '').toUpperCase();
  if (t) {
    for (const [re, cls] of FAMILY) if (re.test(t)) {
      // Military-operated airliners like KC-46 (B762) read better as military heavies.
      if (military && (cls === 'wide' || cls === 'narrow') && /^B76|^DC10|^A33|^B70|^B74/.test(t)) return 'milheavy';
      return cls;
    }
  }
  switch ((category || '').toUpperCase()) {
    case 'A1': return 'piston';
    case 'A2': return 'turboprop';
    case 'A3': return 'narrow';
    case 'A4': return 'narrow';
    case 'A5': return military ? 'milheavy' : 'wide';
    case 'A6': return 'fighter';
    case 'A7': return 'heli';
    case 'B1': case 'B2': case 'B4': case 'B6': return 'light';
    default: break;
  }
  if (t && /^[A-Z]\d{2,3}$/.test(t)) return 'piston';
  return t ? 'piston' : 'light';
}

/** Description for a type code, or null. */
export function typeName(typeCode) {
  return NAMES[(typeCode || '').toUpperCase()] || null;
}

export const isHelicopterClass = (cls) => cls === 'heli';
