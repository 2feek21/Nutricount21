import { createClient } from "@supabase/supabase-js";

const SUPA_URL = "https://xwiymstxajvwbhjuisgm.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3aXltc3R4YWp2d2JoanVpc2dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MDMyMDYsImV4cCI6MjA5MzI3OTIwNn0.IeUF7Uq5_sjcYt7WGxLBZGCLASV0pdfu2MgI5GJDFg4";

export const supabase = createClient(SUPA_URL, SUPA_KEY);
