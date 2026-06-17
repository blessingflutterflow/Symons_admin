'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
      router.replace('/dashboard')
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? ''
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('Invalid email or password.')
      } else if (code === 'auth/operation-not-allowed') {
        setError('Email/Password sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.')
      } else {
        setError(`Error: ${code || String(err)}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1A0A00] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-[#C8880A] flex items-center justify-center mb-4">
            <span className="text-3xl font-bold text-[#1A0A00]">S</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Symon&apos;s Kitchen Admin</h1>
          <p className="text-[#B09060] text-sm mt-1">Sign in to manage your kitchen</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-[#2A1508] border border-[#3D1E0C] text-white placeholder-[#B09060] focus:outline-none focus:border-[#C8880A] transition-colors"
              placeholder="admin@symonskitchen.co.za"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-[#2A1508] border border-[#3D1E0C] text-white placeholder-[#B09060] focus:outline-none focus:border-[#C8880A] transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#C8880A] text-[#1A0A00] font-semibold hover:bg-[#E0A020] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[#B09060] text-xs mt-8">
          Symon&apos;s Kitchen · Admin Dashboard
        </p>
      </div>
    </div>
  )
}
