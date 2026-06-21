'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Store, ShoppingBag, UtensilsCrossed,
  Users, LogOut, ChevronRight, Image, Car, Map as MapIcon,
  Settings, Menu, X, Banknote,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

const nav = [
  { label: 'Dashboard',   href: '/dashboard',   icon: LayoutDashboard },
  { label: 'Live Map',    href: '/map',         icon: MapIcon },
  { label: 'Restaurants', href: '/restaurants', icon: Store },
  { label: 'Orders',      href: '/orders',      icon: ShoppingBag },
  { label: 'Menu Items',  href: '/menu-items',  icon: UtensilsCrossed },
  { label: 'Users',       href: '/users',       icon: Users },
  { label: 'Drivers',     href: '/drivers',     icon: Car },
  { label: 'Payouts',     href: '/payouts',     icon: Banknote },
  { label: 'Banners',     href: '/banners',     icon: Image },
  { label: 'Settings',    href: '/settings',    icon: Settings },
]

function NavLinks({ pathname, onNav }: { pathname: string; onNav?: () => void }) {
  return (
    <>
      {nav.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            onClick={onNav}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              active
                ? 'bg-[#C8880A] text-[#1A0A00]'
                : 'text-[#B09060] hover:text-white hover:bg-[#2A1508]'
            }`}
          >
            <Icon size={18} className="flex-shrink-0" />
            <span className="text-sm font-medium">{label}</span>
            {active && <ChevronRight size={14} className="ml-auto" />}
          </Link>
        )
      })}
    </>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await signOut()
    router.replace('/login')
  }

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#1A0A00] border-b border-[#3D1E0C] flex items-center px-4 z-30">
        <button
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[#B09060] hover:text-white hover:bg-[#2A1508] transition-colors"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2 ml-3">
          <div className="w-7 h-7 rounded-md bg-[#C8880A] flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-[#1A0A00]">S</span>
          </div>
          <span className="text-white font-semibold text-sm">Symon&apos;s Kitchen</span>
        </div>
      </div>

      {/* ── Mobile drawer overlay ───────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile drawer ──────────────────────────────────────────────── */}
      <aside
        className={`md:hidden fixed top-0 left-0 h-full z-50 flex flex-col bg-[#1A0A00] border-r border-[#3D1E0C] w-64 transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-6 py-5 border-b border-[#3D1E0C] flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#C8880A] flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-[#1A0A00]">S</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold leading-none text-sm">Symon&apos;s Kitchen</p>
            <p className="text-[#B09060] text-xs mt-0.5">Admin Dashboard</p>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="text-[#B09060] hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <NavLinks pathname={pathname} onNav={() => setMobileOpen(false)} />
        </nav>
        <div className="px-3 py-4 border-t border-[#3D1E0C]">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-[#B09060] hover:text-white hover:bg-[#2A1508] transition-colors"
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">Log Out</span>
          </button>
        </div>
      </aside>

      {/* ── Desktop sidebar (always visible) ───────────────────────────── */}
      <aside className="hidden md:flex w-60 min-h-screen bg-[#1A0A00] flex-col border-r border-[#3D1E0C]">
        <div className="px-6 py-6 border-b border-[#3D1E0C]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#C8880A] flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold text-[#1A0A00]">S</span>
            </div>
            <div>
              <p className="text-white font-semibold leading-none">Symon&apos;s Kitchen</p>
              <p className="text-[#B09060] text-xs mt-0.5">Admin Dashboard</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <NavLinks pathname={pathname} />
        </nav>
        <div className="px-3 py-4 border-t border-[#3D1E0C]">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-[#B09060] hover:text-white hover:bg-[#2A1508] transition-colors"
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">Log Out</span>
          </button>
        </div>
      </aside>
    </>
  )
}
