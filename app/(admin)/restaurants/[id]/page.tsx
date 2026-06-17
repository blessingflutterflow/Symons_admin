'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { use } from 'react'
import { ArrowLeft, Check, X, MapPin, Clock, Package, Tag, Store, Star } from 'lucide-react'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAY_LABELS: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
}

interface DayHours {
  isOpen: boolean
  open: string
  close: string
}

interface Restaurant {
  name: string
  branch: string
  address: string
  status?: string
  isOpen: boolean
  tags: string
  deliveryTime: string
  minOrder: string
  rating?: number
  reviews?: number
  coverImageUrl?: string
  operatingHours?: Record<string, DayHours>
  createdAt: { toDate?: () => Date } | null
}

export default function RestaurantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [orderCount, setOrderCount] = useState(0)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'restaurants', id), snap => {
      if (snap.exists()) setRestaurant(snap.data() as Restaurant)
    })
    getDocs(query(collection(db, 'orders'), where('restaurantId', '==', id))).then(s => setOrderCount(s.size))
    return unsub
  }, [id])

  async function updateStatus(status: string) {
    setUpdating(true)
    await updateDoc(doc(db, 'restaurants', id), { status, updatedAt: serverTimestamp() })
    setUpdating(false)
  }

  if (!restaurant) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-5 h-5 border-2 border-zinc-300 border-t-[#C8880A] rounded-full animate-spin" />
      </div>
    )
  }

  const status = restaurant.status ?? 'active'

  return (
    <div className="p-8 max-w-4xl">
      {/* Back */}
      <Link href="/restaurants" className="flex items-center gap-2 text-zinc-400 hover:text-zinc-700 text-sm mb-6 transition-colors">
        <ArrowLeft size={16} /> Back to restaurants
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#1A0A00] flex items-center justify-center overflow-hidden flex-shrink-0">
            {restaurant.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.coverImageUrl} alt={restaurant.name} className="w-full h-full object-cover" />
            ) : (
              <Store size={24} className="text-[#C8880A]" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{restaurant.name}</h1>
            <p className="text-zinc-500 text-sm">{restaurant.branch}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          {status === 'pending' && (
            <>
              <button
                onClick={() => updateStatus('active')}
                disabled={updating}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1A0A00] text-[#C8880A] hover:bg-[#2A1508] transition-colors text-sm font-semibold disabled:opacity-50"
              >
                <Check size={14} /> Approve Restaurant
              </button>
              <button
                onClick={() => updateStatus('suspended')}
                disabled={updating}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-sm font-semibold"
              >
                <X size={14} /> Reject
              </button>
            </>
          )}
          {status === 'active' && (
            <button
              onClick={() => updateStatus('suspended')}
              disabled={updating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-sm font-semibold"
            >
              <X size={14} /> Suspend
            </button>
          )}
          {status === 'suspended' && (
            <button
              onClick={() => updateStatus('active')}
              disabled={updating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1A0A00] text-[#C8880A] hover:bg-[#2A1508] transition-colors text-sm font-semibold"
            >
              <Check size={14} /> Reinstate
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Restaurant info */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <h2 className="font-semibold text-zinc-900 mb-4">Restaurant Details</h2>
          <div className="space-y-3">
            <InfoRow icon={MapPin} label="Address" value={restaurant.address} />
            <InfoRow icon={Tag} label="Tags" value={restaurant.tags || '—'} />
            <InfoRow icon={Clock} label="Delivery time" value={restaurant.deliveryTime} />
            <InfoRow icon={Package} label="Min order" value={restaurant.minOrder} />
            <InfoRow icon={Store} label="Open for orders" value={restaurant.isOpen ? 'Yes' : 'No'} />
          </div>
        </div>

        {/* Operating hours */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <h2 className="font-semibold text-zinc-900 mb-4">Operating Hours</h2>
          <div className="space-y-2">
            {WEEKDAYS.map(day => {
              const hours = restaurant.operatingHours?.[day]
              return (
                <div key={day} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600">{WEEKDAY_LABELS[day]}</span>
                  {hours?.isOpen === false ? (
                    <span className="text-zinc-400">Closed</span>
                  ) : (
                    <span className="font-medium text-zinc-900">
                      {hours?.open ?? '09:00'} – {hours?.close ?? '21:00'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Activity */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <h2 className="font-semibold text-zinc-900 mb-4">Activity</h2>
          <div className="space-y-3">
            <InfoRow icon={Package} label="Total orders" value={orderCount.toString()} />
            <InfoRow icon={Star} label="Rating" value={`${(restaurant.rating ?? 5).toFixed(1)} (${restaurant.reviews ?? 0} reviews)`} />
            <InfoRow icon={Clock} label="Applied"
              value={restaurant.createdAt?.toDate ? restaurant.createdAt.toDate().toLocaleDateString('en-ZA') : '—'} />
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="text-zinc-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs text-zinc-400">{label}</p>
        <p className="text-sm font-medium text-zinc-900">{value}</p>
      </div>
    </div>
  )
}
