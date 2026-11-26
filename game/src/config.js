// config.js — every tunable number for Sky Courier: Harbor Run in one place.
//
// The world is a single northbound course measured in metres. The start
// runway sits at the south end, the destination runway at the north end,
// the sea is to the west (negative x) and farmland and the harbour town
// are to the east. Headings are degrees, 0 = north, growing clockwise.

// Canvas / view
export const FOV_SCALE = 1.05;        // focal length as a multiple of canvas height
export const VIEW_DISTANCE = 2800;    // metres; nothing farther is drawn
export const GROUND_CELL = 200;       // terrain patchwork cell size, metres
export const GROUND_SPAN_X = 1700;    // terrain is drawn this far either side of the course

// Airfield geometry
export const RUNWAY_HALF_WIDTH = 24;  // metres from centreline to edge
export const START_RUNWAY = { x: 0, zFrom: -260, zTo: 640 };
export const FINAL_RUNWAY = { x: 0, zFrom: 11800, zTo: 12700 };
export const COURSE_END_Z = 13200;    // flying far past the field ends the run

// Coastline: sea west of this x, land east of it
export const COAST_X = -350;
export const RIVER_Z = 9050;          // the river crosses the course here
export const RIVER_HALF_WIDTH = 90;
export const HARBOR = { xFrom: 480, xTo: 980, zFrom: 5200, zTo: 7200 };

// Aircraft limits (speeds in metres per second)
export const ROTATE_SPEED = 29;       // below this the wings will not lift the plane
export const STALL_SPEED = 23;        // below this, nose high means a stall
export const MAX_SPEED = 78;
export const IDLE_SPEED = 6;          // what full idle still drags the plane toward
export const TOUCHDOWN_MAX_SINK = 5.5; // m/s of descent a landing gear forgives
export const TOUCHDOWN_MAX_SPEED = 58;

// Scoring
export const RING_POINTS = 100;
export const COMBO_STEP = 15;         // extra points per consecutive ring
export const LANDING_MAX_BONUS = 300;
export const RING_RADIUS = 34;        // metres, the hole the plane must thread

// The three missions. Rings are hand-placed so every course can be learned;
// wind and fuel are what change the character of each flight.
export const LEVELS = [
  {
    name: 'Mission 1 — Morning Mail',
    brief: 'Take off, thread 6 rings, land on the far runway.',
    fuel: 100,
    burn: 1.0,
    wind: 0,
    gust: 0,
    rings: [
      { x: -40, alt: 150, z: 1700 },
      { x: 90, alt: 230, z: 2900 },
      { x: 10, alt: 300, z: 3950 },
      { x: -130, alt: 260, z: 5300 },
      { x: 120, alt: 380, z: 6800 },
      { x: 0, alt: 210, z: 8300 },
    ],
  },
  {
    name: 'Mission 2 — Harbor Freight',
    brief: 'A crosswind off the sea. 8 rings, mind the drift.',
    fuel: 95,
    burn: 1.15,
    wind: 3.2,
    gust: 0.6,
    rings: [
      { x: 120, alt: 170, z: 1600 },
      { x: -170, alt: 260, z: 2700 },
      { x: 40, alt: 330, z: 3800 },
      { x: 210, alt: 240, z: 5000 },
      { x: -60, alt: 420, z: 6100 },
      { x: -210, alt: 300, z: 7300 },
      { x: 80, alt: 190, z: 8500 },
      { x: 0, alt: 260, z: 9600 },
    ],
  },
  {
    name: 'Mission 3 — Storm Post',
    brief: 'Gusts, a thirsty engine, 10 rings. Bring her home.',
    fuel: 92,
    burn: 1.3,
    wind: 5.0,
    gust: 1.4,
    rings: [
      { x: -190, alt: 200, z: 1500 },
      { x: 170, alt: 320, z: 2500 },
      { x: -30, alt: 430, z: 3500 },
      { x: 230, alt: 260, z: 4600 },
      { x: -230, alt: 360, z: 5700 },
      { x: 30, alt: 480, z: 6700 },
      { x: 190, alt: 300, z: 7700 },
      { x: -120, alt: 210, z: 8700 },
      { x: 60, alt: 330, z: 9700 },
      { x: 0, alt: 180, z: 10600 },
    ],
  },
];
