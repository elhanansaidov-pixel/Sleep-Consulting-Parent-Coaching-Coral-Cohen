// Public, browser-safe values (the publishable key is designed to be exposed;
// all data access is enforced by RLS + MFA in the database).
export const SUPABASE_URL = 'https://fvkeawbtwbqcvtbqjwem.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_pzOOCFmlTo7uqVZYwR517g_plAE1R-z';

// Public VAPID key for web push (the private key lives only in Supabase secrets).
export const VAPID_PUBLIC_KEY = 'BPpWIP3j4a_cEDClTXqGwZYt3GRBiwIWFP4bK6g-ZqT4hQHjKrZo39HNR5_xsTQqWI4GCogVPQlM_O4fnsCtM6c';
