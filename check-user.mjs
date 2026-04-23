import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(url, key);

// Check user 740045023
const { data: user } = await supabase
  .from('io_employees')
  .select('ohr_id, full_name, actual_role, supervisor_name')
  .eq('ohr_id', '740045023')
  .single();

console.log('User 740045023:', JSON.stringify(user, null, 2));

// Check who has supervisor_name matching this user's full_name
if (user) {
  const { data: team } = await supabase
    .from('io_employees')
    .select('ohr_id, full_name, actual_role, supervisor_name')
    .eq('supervisor_name', user.full_name);
  
  console.log(`\nTeam under "${user.full_name}" (${team?.length || 0} members):`);
  (team || []).forEach(e => console.log(`  ${e.ohr_id} | ${e.full_name} | ${e.actual_role}`));
}

process.exit(0);
