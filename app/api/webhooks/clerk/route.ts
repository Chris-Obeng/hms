import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    console.warn('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local')
    // We shouldn't throw error in production if it's missing just for this setup, but it's required for signature verification
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
  const payload = JSON.parse(body)

  if (WEBHOOK_SECRET) {
    const wh = new Webhook(WEBHOOK_SECRET)
    try {
      wh.verify(body, {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature,
      })
    } catch (err) {
      console.error('Error verifying webhook:', err)
      return new Response('Error occured', {
        status: 400,
      })
    }
  }

  const evt = payload as WebhookEvent
  const supabaseAdmin = await createAdminClient()
  const eventType = evt.type

  if (eventType === 'organizationMembership.created') {
    const data = evt.data
    const clerk_user_id = data.public_user_data.user_id
    const clerk_org_id = data.organization.id
    const rawRole = data.role
    const role = rawRole === 'org:admin' ? 'admin' : 'member'
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
    const role = rawRole === 'org:admin' ? 'admin' : 'member'

    await supabaseAdmin
      .from('staff_profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .match({ clerk_user_id, clerk_org_id })
  }

  if (eventType === 'organizationMembership.deleted') {
    const data = evt.data
    const clerk_user_id = data.public_user_data.user_id
    const clerk_org_id = data.organization.id

    await supabaseAdmin
      .from('staff_profiles')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .match({ clerk_user_id, clerk_org_id })
  }

  if (eventType === 'user.updated') {
    const data = evt.data
    const clerk_user_id = data.id
    const full_name = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim()
    const avatar_url = data.image_url ?? null
    const email = data.email_addresses?.[0]?.email_address ?? null

    await supabaseAdmin
      .from('staff_profiles')
      .update({ email, full_name, avatar_url, updated_at: new Date().toISOString() })
      .match({ clerk_user_id })
  }

  if (eventType === 'user.deleted') {
    const data = evt.data
    const clerk_user_id = data.id

    if (clerk_user_id) {
      await supabaseAdmin
        .from('staff_profiles')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .match({ clerk_user_id })
    }
  }

  return NextResponse.json({ success: true })
}
