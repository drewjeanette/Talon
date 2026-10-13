// Name matching shared by every person search in Talon, so they all behave the
// same: partial matches on first, last, or preferred name, common nicknames
// ("Bob" finds Robert, "Dick" finds Richard), and small typos ("Sophei").

/** Groups of names that refer to the same person. Lowercase, no accents. */
const NICKNAME_GROUPS: string[][] = [
  ["abigail", "abby", "abbie", "gail"],
  ["albert", "al", "bert", "bertie"],
  ["alexander", "alex", "al", "xander", "lex", "sasha", "sandy"],
  ["alexandra", "alex", "alexa", "lexi", "lexie", "sandra", "sasha", "sandy"],
  ["alfred", "al", "alf", "fred", "freddie"],
  ["allison", "alison", "ali", "allie", "ally"],
  ["amanda", "mandy", "manda"],
  ["andrew", "andy", "drew"],
  ["angela", "angie"],
  ["anthony", "tony", "ant"],
  ["arthur", "art", "artie"],
  ["barbara", "barb", "barbie", "babs"],
  ["benjamin", "ben", "benny", "benji"],
  ["beverly", "bev"],
  ["bradley", "brad"],
  ["cameron", "cam"],
  ["charles", "charlie", "chuck", "chas", "chaz", "chip"],
  ["charlotte", "charlie", "lottie"],
  ["christina", "chris", "christine", "tina", "chrissy", "kristina", "kristen"],
  ["christopher", "chris", "kit", "topher", "kris"],
  ["cynthia", "cindy"],
  ["daniel", "dan", "danny"],
  ["danielle", "dani", "danni"],
  ["david", "dave", "davey", "davy"],
  ["deborah", "debra", "deb", "debbie"],
  ["dominic", "dom", "nick"],
  ["donald", "don", "donnie"],
  ["dorothy", "dot", "dottie", "dory"],
  ["douglas", "doug"],
  ["edward", "ed", "eddie", "ted", "teddy", "ned"],
  ["eleanor", "ellie", "nora", "nell"],
  ["elizabeth", "liz", "lizzie", "lizzy", "beth", "betty", "betsy", "eliza", "libby", "liza", "elsie", "bess"],
  ["emily", "em", "emmy"],
  ["eugene", "gene"],
  ["evan", "ev"],
  ["frances", "fran", "frankie"],
  ["francis", "frank", "frankie"],
  ["frederick", "fred", "freddie", "freddy", "rick"],
  ["gabriel", "gabe"],
  ["gabrielle", "gabby", "gabi", "elle"],
  ["gerald", "gerry", "jerry"],
  ["gilbert", "gil", "bert"],
  ["gregory", "greg"],
  ["harold", "harry", "hal"],
  ["henry", "hank", "harry", "hal"],
  ["herbert", "herb", "bert"],
  ["isabella", "isabel", "bella", "izzy", "isa"],
  ["jacob", "jake", "jakey"],
  ["james", "jim", "jimmy", "jamie", "jem"],
  ["jeffrey", "jeff"],
  ["jennifer", "jen", "jenn", "jenny"],
  ["jessica", "jess", "jessie"],
  ["john", "jack", "johnny", "jon"],
  ["jonathan", "jon", "jonny", "johnny", "nathan"],
  ["joseph", "joe", "joey", "jo"],
  ["josephine", "jo", "josie", "jojo"],
  ["joshua", "josh"],
  ["katherine", "catherine", "kathryn", "kate", "katie", "kathy", "cathy", "kat", "kay", "kit", "kitty"],
  ["kenneth", "ken", "kenny"],
  ["kimberly", "kim", "kimmy"],
  ["lawrence", "laurence", "larry", "laurie"],
  ["leonard", "leo", "len", "lenny"],
  ["madeline", "madeleine", "maddie", "maddy"],
  ["margaret", "maggie", "meg", "peggy", "marge", "margie", "greta", "daisy"],
  ["matthew", "matt", "matty"],
  ["melissa", "mel", "missy", "lissa"],
  ["michael", "mike", "mikey", "mick", "mickey"],
  ["nathaniel", "nate", "nathan", "nat"],
  ["nicholas", "nick", "nicky", "nico"],
  ["olivia", "liv", "livvy", "ollie"],
  ["pamela", "pam"],
  ["patricia", "pat", "patty", "patsy", "trish", "tricia"],
  ["patrick", "pat", "paddy", "patty"],
  ["peter", "pete"],
  ["philip", "phillip", "phil"],
  ["raymond", "ray"],
  ["rebecca", "becky", "becca", "bex"],
  ["richard", "rich", "richie", "rick", "ricky", "dick", "dickie"],
  ["robert", "rob", "robbie", "bob", "bobby", "bert", "bertie"],
  ["ronald", "ron", "ronnie"],
  ["russell", "russ"],
  ["samantha", "sam", "sammy"],
  ["samuel", "sam", "sammy"],
  ["sophia", "sophie", "sofia", "soph"],
  ["stephanie", "steph", "stephie"],
  ["stephen", "steven", "steve", "stevie"],
  ["susan", "sue", "susie", "suzy"],
  ["theodore", "ted", "teddy", "theo"],
  ["theresa", "teresa", "terry", "tess", "tessa", "tracy"],
  ["thomas", "tom", "tommy"],
  ["timothy", "tim", "timmy"],
  ["valerie", "val"],
  ["victoria", "vicky", "vickie", "tori", "vic"],
  ["vincent", "vince", "vinny"],
  ["walter", "walt", "wally"],
  ["william", "will", "bill", "billy", "willie", "willy", "liam"],
  ["zachary", "zach", "zack", "zac"],
];

/** name -> every name it can stand for (excluding itself). */
const NICKNAMES = new Map<string, Set<string>>();
for (const group of NICKNAME_GROUPS) {
  for (const name of group) {
    const set = NICKNAMES.get(name) ?? new Set<string>();
    for (const other of group) if (other !== name) set.add(other);
    NICKNAMES.set(name, set);
  }
}

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.\s-]/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value).split(/[\s,.-]+/).filter(Boolean);
}

/** Optimal string alignment distance (Levenshtein plus adjacent swaps), capped for speed. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2][j - 2] + 1);
      rows[i][j] = value;
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
  }
  return rows[a.length][b.length];
}

/** How many typos to forgive: none for very short words, one, then two for long ones. */
function allowedTypos(length: number): number {
  return length < 4 ? 0 : length < 7 ? 1 : 2;
}

/**
 * Cost of matching one typed word against one name word, or null for no match.
 * Lower is better: exact < prefix < nickname < typo.
 */
function wordCost(query: string, name: string): number | null {
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (NICKNAMES.get(name)?.has(query)) return 1.5;
  for (const nickname of NICKNAMES.get(name) ?? []) {
    if (query.length >= 2 && nickname.startsWith(query)) return 2;
  }
  if (query.length >= 3 && name.includes(query)) return 2.5;
  const typos = allowedTypos(query.length);
  if (typos === 0) return null;
  // Compare against the whole word and against a same-length prefix, so a
  // typo in a partly typed name ("Chirs" for Christopher) still matches.
  const distance = Math.min(
    editDistance(query, name, typos),
    name.length > query.length ? editDistance(query, name.slice(0, query.length), typos) : typos + 1
  );
  if (distance <= typos) return 3 + distance;
  for (const nickname of NICKNAMES.get(name) ?? []) {
    if (editDistance(query, nickname, typos) <= typos) return 4 + typos;
  }
  return null;
}

export interface Searchable {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  email?: string;
}

/**
 * Scores a person against a typed query, or returns null when they don't
 * match. Every typed word must match a different part of the name.
 */
export function matchScore(person: Searchable, query: string): number | null {
  const typed = tokens(query);
  if (typed.length === 0) return 0;
  const words = [
    ...tokens(person.firstName),
    ...tokens(person.lastName),
    ...(person.preferredName ? tokens(person.preferredName) : []),
  ];
  const email = person.email ? normalize(person.email) : "";

  let total = 0;
  const used = new Set<number>();
  for (const word of typed) {
    let best: { cost: number; index: number } | null = null;
    if (!word.includes("@")) {
      words.forEach((name, index) => {
        if (used.has(index)) return;
        const cost = wordCost(word, name);
        if (cost !== null && (!best || cost < best.cost)) best = { cost, index };
      });
    }
    if (best) {
      const { cost, index } = best as { cost: number; index: number };
      used.add(index);
      total += cost;
    } else if (email && word.length >= 3 && email.startsWith(word)) {
      total += 2; // fall back to the email address
    } else {
      return null;
    }
  }
  return total;
}

/** People matching the query, best first, then alphabetically by last name. */
export function searchPeople<T extends Searchable>(people: T[], query: string, limit = 8): T[] {
  return people
    .map((person) => ({ person, score: matchScore(person, query) }))
    .filter((row): row is { person: T; score: number } => row.score !== null)
    .sort((a, b) => a.score - b.score || a.person.lastName.localeCompare(b.person.lastName) || a.person.firstName.localeCompare(b.person.firstName))
    .slice(0, limit)
    .map((row) => row.person);
}

/** "Sophia (Sophie) Wells" when a preferred name differs, else "Sophia Wells". */
export function displayName(person: Searchable): string {
  const preferred = person.preferredName?.trim();
  return preferred && preferred.toLowerCase() !== person.firstName.toLowerCase()
    ? `${person.firstName} (${preferred}) ${person.lastName}`
    : `${person.firstName} ${person.lastName}`;
}
