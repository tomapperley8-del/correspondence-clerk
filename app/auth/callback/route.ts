import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { userHasProfile } from '@/lib/auth-helpers'
import { acceptInvitation } from '@/app/actions/invitations'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const invitationToken = searchParams.get('invitation_token')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Check if user has a profile
      const hasProfile = await userHasProfile()

      if (!hasProfile) {
        // User doesn't have a profile yet
        if (invitationToken) {
          // Accept invitation
          const {
            data: { user },
          } = await supabase.auth.getUser()

          if (user) {
            const result = await acceptInvitation(invitationToken, user.id)

            if (result.error) {
              // If invitation acceptance failed, redirect to error page
              return NextResponse.redirect(
                `${origin}/auth/auth-code-error?error=${encodeURIComponent(result.error)}`
              )
            }
            // Invitation accepted successfully, redirect to dashboard
            return NextResponse.redirect(`${origin}/dashboard`)
          }
        } else {
          // No invitation token, redirect to create organization
          return NextResponse.redirect(`${origin}/onboarding/create-organization`)
        }
      }

      // User has profile, proceed to next page
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
