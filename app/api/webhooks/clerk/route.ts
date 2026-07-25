import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent, clerkClient } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  // Fail closed: without the secret we cannot authenticate the payload, and this
  // handler writes staff_profiles rows (including super_admin roles) with the
  // service-role client.
  if (!WEBHOOK_SECRET) {
    console.error('[webhook] CLERK_WEBHOOK_SECRET is not configured')
    return new Response('Server misconfiguration', { status: 500 })
  }

  // Get the headers
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400,
    })
  }

  const body = await req.text()
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch (err) {
    console.error('[webhook] failed to parse Clerk webhook body as JSON:', err)
    return new Response('Invalid JSON body', { status: 400 })
  }

  const wh = new Webhook(WEBHOOK_SECRET)
  let evt: WebhookEvent
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying webhook:', err)
    return new Response('Error occured', {
      status: 400,
    })
  }

  const eventType = evt.type

  if (eventType === 'user.created') {
    const data = evt.data
    const inviteToken = data.unsafe_metadata?.inviteToken as string | undefined
    if (inviteToken) {
      try {
        const { data: invite } = await supabaseAdmin
          .from('staff_invitations')
          .select('*')
          .eq('token', inviteToken)
          .eq('is_used', false)
          .single()

        if (invite && new Date(invite.expires_at) > new Date()) {
          const clerk = await clerkClient()
          const clerkRole = invite.role === 'super_admin' ? 'org:admin' : 'org:member'
          
          await clerk.organizations.createOrganizationMembership({
            organizationId: invite.clerk_org_id,
            userId: data.id,
            role: clerkRole,
          })

          await supabaseAdmin
            .from('staff_invitations')
            .update({ is_used: true })
            .eq('token', inviteToken)
        }
      } catch (err) {
        console.error('[webhook] failed to auto-join user to organization:', err)
      }
    }
  }

  if (eventType === 'organizationMembership.created') {
    const data = evt.data
    const clerk_user_id = data.public_user_data.user_id
    const clerk_org_id = data.organization.id
    const rawRole = data.role
    
    // Default role mapping
    let role = rawRole === 'org:admin' ? 'super_admin' : 'front_desk'

    // Look up correct role if user joined via invite token.
    // unsafeMetadata is writable by the user, so the token alone grants nothing:
    // the invitation must exist, be unexpired, and belong to the org being joined.
    try {
      const clerk = await clerkClient()
      const user = await clerk.users.getUser(clerk_user_id)
      const token = user.unsafeMetadata?.inviteToken as string | undefined
      if (token) {
        const { data: invite } = await supabaseAdmin
          .from('staff_invitations')
          .select('role, expires_at, clerk_org_id')
          .eq('token', token)
          .eq('clerk_org_id', clerk_org_id)
          .single()
        if (invite && new Date(invite.expires_at) > new Date()) {
          role = invite.role as string
        }
      }
    } catch (err) {
      console.error('[webhook] failed to resolve role from invite token:', err)
    }

    const full_name = `${data.public_user_data.first_name ?? ''} ${data.public_user_data.last_name ?? ''}`.trim()
    const avatar_url = data.public_user_data.image_url ?? null
    const email = data.public_user_data.identifier ?? null

    const { error } = await supabaseAdmin
      .from('staff_profiles')
      .upsert(
        {
          clerk_user_id,
          clerk_org_id,
          email,
          full_name,
          avatar_url,
          role,
          is_active: true,
          granted_at: new Date().toISOString(),
          granted_by: null,
          notification_prefs: {},
        },
        {
          onConflict: 'clerk_user_id,clerk_org_id',
        }
      )

    if (error) {
      console.error('[webhook] staff_profiles upsert failed:', error)
    }
  }

  if (eventType === 'organizationMembership.updated') {
    const data = evt.data
    const clerk_user_id = data.public_user_data.user_id
    const clerk_org_id = data.organization.id
    const rawRole = data.role
    const role = rawRole === 'org:admin' ? 'super_admin' : 'front_desk'

    const { error } = await supabaseAdmin
      .from('staff_profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .match({ clerk_user_id, clerk_org_id })

    if (error) {
      console.error('[webhook] staff_profiles role update failed:', error)
    }
  }

  if (eventType === 'organizationMembership.deleted') {
    const data = evt.data
    const clerk_user_id = data.public_user_data.user_id
    const clerk_org_id = data.organization.id

    const { error } = await supabaseAdmin
      .from('staff_profiles')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .match({ clerk_user_id, clerk_org_id })

    if (error) {
      console.error('[webhook] staff_profiles deactivation (membership deleted) failed:', error)
    }
  }

  if (eventType === 'user.updated') {
    const data = evt.data
    const clerk_user_id = data.id
    const full_name = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim()
    const avatar_url = data.image_url ?? null
    const email = data.email_addresses?.[0]?.email_address ?? null

    const { error } = await supabaseAdmin
      .from('staff_profiles')
      .update({ email, full_name, avatar_url, updated_at: new Date().toISOString() })
      .match({ clerk_user_id })

    if (error) {
      console.error('[webhook] staff_profiles user.updated sync failed:', error)
    }
  }

  if (eventType === 'user.deleted') {
    const data = evt.data
    const clerk_user_id = data.id

    if (clerk_user_id) {
      const { error } = await supabaseAdmin
        .from('staff_profiles')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .match({ clerk_user_id })

      if (error) {
        console.error('[webhook] staff_profiles deactivation (user deleted) failed:', error)
      }
    }
  }

  return NextResponse.json({ success: true })
}
