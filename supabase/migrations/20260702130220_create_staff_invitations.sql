-- Create staff_invitations table
CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_org_id text NOT NULL,
  role text NOT NULL,
  token text UNIQUE NOT NULL,
  is_used boolean DEFAULT false NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS (Service role only, no public reads/writes)
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
