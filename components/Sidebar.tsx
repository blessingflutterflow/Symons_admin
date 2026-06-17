'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Store, ShoppingBag, UtensilsCrossed,
  Users, LogOut, ChevronRight, Image, Car, Map as MapIcon, Settings
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
  { label: 'Banners',     href: '/banners',     icon: Image },
  { label: 'Settings',    href: '/settings',    icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuth()

  async function handleLogout() {
    await signOut()
    router.replace('/login')
  }

  return (
    <aside className="w-60 min-h-screen bg-[#1A0A00] flex flex-col border-r border-[#3D1E0C]">
      {/* Logo */}
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

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
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
      </nav>

      {/* Footer */}
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
  )
}
