'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setIsLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div
        className="hidden md:flex md:w-2/5 flex-col justify-between p-12"
        style={{ backgroundColor: '#1E293B' }}
      >
        <Link
          href="/"
          className="text-xl font-bold text-white"
          style={{ fontFamily: 'Lora, Georgia, serif' }}
        >
          Correspondence Clerk
        </Link>
        <div>
          <p
            className="text-2xl font-semibold text-white leading-snug mb-3"
            style={{ fontFamily: 'Lora, Georgia, serif' }}
          >
            Know exactly what needs your attention today.
          </p>
          <p className="text-sm" style={{ color: '#94a3b8' }}>
            Your business correspondence, organised and ready to act on.
          </p>
        </div>
        <p className="text-xs" style={{ color: '#475569' }}>
          &copy; {new Date().getFullYear()} Correspondence Clerk
        </p>
      </div>

      {/* Right panel */}
      <div
        className="flex-1 flex items-center justify-center px-6 py-12"
        style={{ backgroundColor: '#FAFAF8' }}
      >
        <div className="w-full max-w-sm">
          <h1
            className="text-2xl font-bold mb-2 text-gray-900"
            style={{ fontFamily: 'Lora, Georgia, serif' }}
          >
            Welcome back
          </h1>
          <p className="text-sm text-gray-500 mb-8">Sign in to your account</p>

          {error && (
            <div
              className="px-4 py-3 mb-6 rounded-sm"
              style={{ backgroundColor: '#FEF2F2', border: '1px solid rgba(220,38,38,0.2)' }}
            >
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="email" className="block mb-2 font-semibold text-sm text-gray-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="w-full"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <Label htmlFor="password" className="block mb-2 font-semibold text-sm text-gray-700">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="w-full"
                placeholder="••••••••"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full text-white font-semibold py-3"
              style={{ backgroundColor: '#2C4A6E' }}
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-medium" style={{ color: '#2C4A6E' }}>
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
