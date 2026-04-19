import mysql from 'mysql2/promise';

// Common Filipino female first names / name patterns
const FEMALE_NAMES = new Set([
  'abegail','abigail','aileen','aira','aiza','alexa','alexandra','alice','alicia','allison',
  'althea','alyssa','amanda','amber','amelia','amy','ana','andrea','angel','angela','angelica',
  'angelina','angeline','angie','anna','anne','annette','april','ariane','arianne','ariel',
  'ashley','aubrey','aurora','beatrice','bella','bernadette','bernice','beth','bianca','brenda',
  'bridget','camille','carla','carmen','carol','caroline','catherine','cecilia','celeste',
  'charlene','charlotte','cherry','cheryl','christine','cindy','claire','clara','clarissa',
  'claudia','colleen','cristina','cynthia','daisy','danielle','daphne','darla','dawn','debbie',
  'denise','diana','diane','donna','doris','dorothy','edith','eileen','elaine','elena',
  'elizabeth','ella','ellen','elsa','emily','emma','erica','erika','estelle','esther','eula',
  'eunice','eva','evelyn','faith','fatima','felicia','fiona','florence','frances','francesca',
  'gabrielle','gail','gemma','genevieve','georgia','geraldine','gina','gladys','glenda','gloria',
  'grace','gwen','hannah','hazel','heather','helen','hillary','holly','hope','ida','irene',
  'iris','isabel','isabella','ivy','jacqueline','jade','jamie','jane','janet','janice',
  'jasmine','jean','jeanette','jennifer','jenny','jessica','jill','joan','joanna','jocelyn',
  'jolina','josephine','joy','joyce','judith','judy','julia','juliana','julie','juliet',
  'justine','karen','karina','kate','katherine','kathleen','kathryn','katrina','kayla','kelly',
  'kendra','kimberly','kristen','kristina','kristine','lara','laura','lauren','leah','leilani',
  'lena','leslie','leticia','lily','linda','lisa','liza','lorena','lorraine','louise','lucia',
  'lucille','lucy','lydia','lynn','mabel','madeleine','mae','magdalena','maggie','maia',
  'mandy','margaret','maria','marian','marianne','marie','marilyn','marina','marissa','marjorie',
  'marlene','martha','mary','maureen','maxine','maya','megan','melanie','melissa','melody',
  'mercedes','mia','michelle','mildred','miranda','miriam','moira','monica','monique','muriel',
  'myrna','nancy','natalie','natasha','nicole','nina','nora','noreen','norma','olivia','oona',
  'pamela','patricia','paula','pauline','pearl','penelope','petra','phoebe','phyllis','priscilla',
  'rachel','ramona','raquel','rebecca','regina','renee','rhea','rita','roberta','rochelle',
  'rosa','rosalie','rosalind','rose','roseann','rosemary','roxanne','ruby','ruth','sabrina',
  'sally','samantha','sandra','sarah','selena','serena','sharon','sheila','shiela','shirley',
  'silvia','simone','sofia','sonia','sophia','stacy','stella','stephanie','susan','suzanne',
  'sylvia','tamara','tanya','teresa','thelma','theresa','tiffany','tina','tracy','trisha',
  'ursula','valerie','vanessa','vera','veronica','victoria','viola','violet','virginia',
  'vivian','wendy','whitney','wilma','yvette','yvonne','zoe',
  // Common Filipino female nicknames / diminutives
  'aina','aira','anj','ate','bea','cess','charm','czarina','darlene','dianne',
  'donna','ella','ericka','faye','gia','gigi','hannah','ivy','janelle','jessa',
  'jhane','jhia','joie','kate','kaye','kris','kristel','lyka','mariel','mariz',
  'mhel','mika','nica','nikki','pat','pia','ria','rica','riza','rosie',
  'roxie','sarrah','shaina','sharmaine','trixie','yza','zel',
]);

const MALE_NAMES = new Set([
  'aaron','abel','abraham','adam','adrian','aiden','alan','albert','alejandro','alex',
  'alexander','alfred','allan','allen','alvin','ambrose','amos','andre','andrew','angel',
  'angelo','anthony','antonio','archie','ariel','arnold','arthur','arvin','austin','barry',
  'benjamin','bernard','bert','billy','blake','boris','brad','brandon','brian','bruce',
  'bryan','byron','caleb','calvin','cameron','carl','carlos','cedric','cesar','chad',
  'charles','chester','chris','christian','christopher','clarence','clark','claude','clifford',
  'clint','clyde','cody','colin','conrad','corey','craig','cristian','curtis','cyrus',
  'dale','damian','daniel','danny','darren','darwin','dave','david','dean','dennis',
  'derek','desmond','dexter','diego','dominic','donald','douglas','drew','duncan','dustin',
  'dwight','dylan','earl','edgar','edmund','eduardo','edward','edwin','eli','elijah',
  'elliot','elmer','elvis','emilio','emmanuel','enrique','eric','ernest','erwin','ethan',
  'eugene','evan','felix','fernando','floyd','francis','francisco','frank','franklin','fred',
  'frederick','gabriel','gary','george','gerald','gerard','gilbert','glenn','gordon','grant',
  'greg','gregory','harold','harry','harvey','hector','henry','herbert','herman','howard',
  'hugo','ian','ignacio','irving','isaac','ivan','jack','jacob','jake','james','jared',
  'jason','javier','jay','jeff','jeffrey','jeremy','jerome','jerry','jesse','jim','jimmy',
  'joaquin','joe','joel','john','johnny','jonathan','jordan','jorge','jose','joseph','joshua',
  'juan','julian','julius','justin','karl','keith','ken','kenneth','kevin','kirk','kurt',
  'kyle','lance','larry','lawrence','lee','leo','leon','leonard','leroy','lester','lewis',
  'liam','lloyd','logan','lorenzo','louis','lucas','luis','luke','luther','lyle','manuel',
  'marc','marco','marcos','marcus','mario','mark','marshall','martin','marvin','mason',
  'matthew','maurice','max','michael','miguel','miles','mitchell','morris','nathan','neil',
  'nelson','nicholas','nick','noah','noel','norman','oliver','omar','orlando','oscar',
  'owen','pablo','patrick','paul','pedro','perry','peter','philip','phillip','pierce',
  'rafael','ralph','ramon','randall','randy','raphael','ray','raymond','rene','rex',
  'reynaldo','ricardo','richard','rick','robert','roberto','rodney','rodrigo','roger','roland',
  'roman','ronald','ross','roy','ruben','russell','ryan','salvador','sam','samuel','santiago',
  'scott','sean','sebastian','sergio','seth','shane','shaun','simon','spencer','stanley',
  'stephen','steve','steven','stuart','ted','terry','theodore','thomas','timothy','todd',
  'tom','tony','travis','trevor','troy','tyler','vernon','victor','vincent','virgil',
  'wade','wallace','walter','warren','wayne','wendell','wesley','william','wilson','winston',
  // Common Filipino male nicknames
  'aldrin','alexis','alfie','andrei','arjay','benedict','benjo','bong','carlo','cj',
  'dan','daryl','dex','dj','dom','don','ed','edgardo','efren','ej','elmer','ernie',
  'ferdie','fidel','froilan','gab','gio','hans','harvey','ino','ivan','jc','jed',
  'jeff','jem','jhon','jm','jobert','jojo','jon','jp','jr','jun','karl','kc',
  'ken','kj','krantz','lance','lj','louie','manny','marlon','mj','mon','neil',
  'nico','nino','ogie','pj','rj','rob','rod','rodel','rogelio','romy','ron',
  'ronaldo','ronnie','rudy','ruel','rj','renz','rico','rj','rodel','rolando',
  'romeo','ronaldo','ruben','sam','sonny','tito','vince','wil','yohan',
]);

// Female suffixes / patterns
const FEMALE_PATTERNS = [
  /^ma\.\s/i, /^maria\s/i, /^mary\s/i, /^ana\s/i, /^anne?\s/i,
  /lyn$/i, /ine$/i, /elle$/i, /ette$/i, /issa$/i, /essa$/i,
  /ina$/i, /ena$/i, /ica$/i, /ita$/i, /cia$/i, /sia$/i,
  /belle$/i, /zel$/i, /mae$/i, /leigh$/i, /leen$/i, /lene$/i,
];

const MALE_PATTERNS = [
  /^jr\.?\s/i, /^sr\.?\s/i,
];

function inferSex(givenName, fullName) {
  if (!givenName && !fullName) return 'M'; // default
  
  const name = (givenName || '').trim();
  const firstName = name.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  const fullLower = name.toLowerCase();
  
  // Check exact match first
  if (FEMALE_NAMES.has(firstName)) return 'F';
  if (MALE_NAMES.has(firstName)) return 'M';
  
  // Check if "Ma." or "Maria" prefix
  if (/^ma\.\s/i.test(name) || /^maria\s/i.test(name) || /^mary\s/i.test(name)) return 'F';
  
  // Check female patterns
  for (const p of FEMALE_PATTERNS) {
    if (p.test(firstName) || p.test(name)) return 'F';
  }
  
  // Check male patterns
  for (const p of MALE_PATTERNS) {
    if (p.test(name)) return 'M';
  }
  
  // Check second name if first is ambiguous
  const parts = name.split(/\s+/);
  if (parts.length > 1) {
    const second = parts[1].toLowerCase().replace(/[^a-z]/g, '');
    if (FEMALE_NAMES.has(second)) return 'F';
    if (MALE_NAMES.has(second)) return 'M';
  }
  
  // Default to M (user will correct)
  return 'M';
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Get all employees
  const [rows] = await conn.execute('SELECT ohr_id, full_name, given_name FROM io_employees');
  
  let mCount = 0, fCount = 0;
  const updates = [];
  
  for (const row of rows) {
    const sex = inferSex(row.given_name, row.full_name);
    updates.push({ ohr_id: row.ohr_id, sex, name: row.full_name });
    if (sex === 'F') fCount++;
    else mCount++;
  }
  
  // Batch update
  for (const u of updates) {
    await conn.execute('UPDATE io_employees SET sex = ? WHERE ohr_id = ?', [u.sex, u.ohr_id]);
  }
  
  console.log(`Updated ${updates.length} employees: ${fCount} Female, ${mCount} Male`);
  
  // Print a sample of inferred females for verification
  const females = updates.filter(u => u.sex === 'F').slice(0, 20);
  console.log('\nSample females:');
  females.forEach(f => console.log(`  ${f.name}`));
  
  await conn.end();
}

main().catch(console.error);
