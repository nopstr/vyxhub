import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://agoekmugbrswrdjscwek.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnb2VrbXVnYnJzd3JkanNjd2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMzQ0OTEsImV4cCI6MjA4NjYxMDQ5MX0.xltRyfUlVk--YVA_90Puv_7Q179vFYbQ1mzgqozEkIo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
  const { data, error } = await supabase.from('schema_migrations').select('*').limit(10);
  console.log('schema_migrations:', { data, error });
}

checkTable();