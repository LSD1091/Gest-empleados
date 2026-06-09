/**
 * TimeControl — Configuración de Supabase
 */

const SUPABASE_URL  = 'https://rqlfqbcyjszarzkbwufw.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxbGZxYmN5anN6YXJ6a2J3dWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTc4MjcsImV4cCI6MjA5NjU5MzgyN30.hP6Q9irZmpgqhgx4GDw9dkOZXA1p-fjT1eFQTl6tYX0';

const { createClient } = supabase;
window._supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
