'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Save, Truck, Percent, Banknote } from 'lucide-react'

const DEFAULT_FEE = 35

export default function SettingsPage() {
  const [flatFee, setFlatFee] = useState(DEFAULT_FEE)
  const [commission, setCommission] = useState(0)
  const [yocoSecretKey, setYocoSecretKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'settings', 'delivery')),
      getDoc(doc(db, 'settings', 'commission')),
      getDoc(doc(db, 'settings', 'yoco')),
    ]).then(([deliverySnap, commissionSnap, yocoSnap]) => {
      const fee = deliverySnap.data()?.flatFee
      if (typeof fee === 'number') setFlatFee(fee)
      const pct = commissionSnap.data()?.percent
      if (typeof pct === 'number') setCommission(pct)
      const yocoSecret = yocoSnap.data()?.secretKey
      if (typeof yocoSecret === 'string') setYocoSecretKey(yocoSecret)
      setLoading(false)
    })
  }, [])

  async function save() {
    setSaving(true)
    await Promise.all([
      setDoc(doc(db, 'settings', 'delivery'), { flatFee, updatedAt: serverTimestamp() }, { merge: true }),
      setDoc(doc(db, 'settings', 'commission'), { percent: commission, updatedAt: serverTimestamp() }, { merge: true }),
      setDoc(doc(db, 'settings', 'yoco'), { secretKey: yocoSecretKey, updatedAt: serverTimestamp() }, { merge: true }),
    ])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="w-5 h-5 border-2 border-zinc-300 border-t-[#C8880A] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">Platform-wide configuration</p>
      </div>

      {/* Commission */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[#1A0A00] flex items-center justify-center flex-shrink-0">
            <Percent size={16} className="text-[#C8880A]" />
          </div>
          <h2 className="font-semibold text-zinc-900">Commission</h2>
        </div>
        <p className="text-sm text-zinc-500 mb-4 ml-12">
          A markup added on top of every product price. Customers see the
          marked-up price; the markup is the business&apos;s margin.
        </p>
        <div className="flex items-end gap-3 ml-12">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
              Commission rate
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                step="0.1"
                value={commission}
                onChange={e => setCommission(Number(e.target.value))}
                className="w-32 pl-3 pr-7 py-2 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:border-zinc-400"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">%</span>
            </div>
          </div>
          <p className="text-xs text-zinc-400 pb-2.5">
            e.g. R100 item at {commission}% → customer pays R{(100 * (1 + commission / 100)).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Delivery Fee */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[#1A0A00] flex items-center justify-center flex-shrink-0">
            <Truck size={16} className="text-[#C8880A]" />
          </div>
          <h2 className="font-semibold text-zinc-900">Delivery Fee</h2>
        </div>
        <p className="text-sm text-zinc-500 mb-4 ml-12">
          A flat fee applied to every order. This is what the driver earns per
          delivery (paid out manually under Driver Payouts).
        </p>
        <div className="flex items-end gap-3 ml-12">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
              Flat fee
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">R</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={flatFee}
                onChange={e => setFlatFee(Number(e.target.value))}
                className="w-32 pl-7 pr-3 py-2 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:border-zinc-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Yoco Key */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[#1A0A00] flex items-center justify-center flex-shrink-0">
            <Banknote size={16} className="text-[#C8880A]" />
          </div>
          <h2 className="font-semibold text-zinc-900">Yoco</h2>
        </div>
        <p className="text-sm text-zinc-500 mb-4 ml-12">
          The Yoco secret key used by Cloud Functions for customer payments and
          refunds. Never expose it client-side.
        </p>
        <div className="flex items-end gap-3 ml-12">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
              Secret Key
            </label>
            <input
              type="password"
              value={yocoSecretKey}
              onChange={e => setYocoSecretKey(e.target.value)}
              placeholder="sk_live_..."
              className="w-full pl-3 pr-3 py-2 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:border-zinc-400"
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1A0A00] text-[#C8880A] text-sm font-semibold hover:bg-[#2A1508] disabled:opacity-50 transition-colors"
        >
          <Save size={16} />
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save All'}
        </button>
      </div>
    </div>
  )
}
