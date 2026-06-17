'use client'

import { X, Car, MapPin, Clock, Navigation } from 'lucide-react'

interface DriverLocation {
  id: string
  driverId: string
  driverName: string
  lat: number
  lng: number
  bearing?: number
  isActive: boolean
  timestamp: { toDate?: () => Date } | null
}

export default function DriverPanel({
  driver,
  onClose,
}: {
  driver: DriverLocation
  onClose: () => void
}) {
  return (
    <div className="absolute top-0 right-0 h-full w-[340px] bg-white shadow-2xl flex flex-col z-10 border-l border-zinc-200">
      {/* Header */}
      <div className="px-5 py-4 bg-[#1A0A00] text-[#FAF0DC] flex items-start justify-between flex-shrink-0">
        <div>
          <p className="text-[10px] font-semibold text-[#B09060] uppercase tracking-widest mb-0.5">Driver</p>
          <h2 className="font-bold text-base leading-tight">{driver.driverName}</h2>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-[#B09060]">Online now</span>
          </div>
        </div>
        <button onClick={onClose} className="text-[#B09060] hover:text-white transition-colors mt-0.5">
          <X size={18} />
        </button>
      </div>

      {/* Stats */}
      <div className="p-4 space-y-2.5 flex-1 overflow-y-auto">
        <Stat
          icon={<Navigation size={15} className="text-[#1A0A00]" />}
          iconBg="bg-[#E0A020]"
          label="Bearing"
          value={`${(driver.bearing || 0).toFixed(0)}°`}
          sub={bearingLabel(driver.bearing ?? 0)}
        />
        <Stat
          icon={<MapPin size={15} className="text-white" />}
          iconBg="bg-[#3D1E0C]"
          label="Last Position"
          value={`${driver.lat.toFixed(5)}, ${driver.lng.toFixed(5)}`}
          sub="GPS coordinates"
        />
        {driver.timestamp?.toDate && (
          <Stat
            icon={<Clock size={15} className="text-white" />}
            iconBg="bg-[#3D1E0C]"
            label="Last Update"
            value={driver.timestamp.toDate().toLocaleTimeString('en-ZA')}
            sub={driver.timestamp.toDate().toLocaleDateString('en-ZA')}
          />
        )}
        <Stat
          icon={<Car size={15} className="text-white" />}
          iconBg="bg-[#3D1E0C]"
          label="Driver ID"
          value={driver.driverId?.substring(0, 12) + '…'}
          sub="Firebase UID"
        />
      </div>
    </div>
  )
}

function Stat({
  icon, iconBg, label, value, sub,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-zinc-400">{label}</p>
        <p className="text-sm font-semibold text-zinc-900">{value}</p>
        {sub && <p className="text-xs text-zinc-400">{sub}</p>}
      </div>
    </div>
  )
}

function bearingLabel(bearing: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(bearing / 45) % 8]
}
