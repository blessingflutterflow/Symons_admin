'use client'

import { useEffect, useState } from 'react'
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Car, CheckCircle, XCircle, Clock, User, Phone, Mail, FileText, Badge as BadgeIcon } from 'lucide-react'
import StatusBadge from '@/components/StatusBadge'

interface Driver {
  id: string
  name: string
  phone: string
  email?: string
  idNumber: string
  idType?: 'sa_id' | 'passport'
  licenceNumber: string
  vehicleType: string
  vehicleReg: string
  status: 'incomplete' | 'pending_review' | 'approved' | 'rejected' | 'suspended'
  rejectionReason?: string
  isOnline?: boolean
  submittedAt?: Timestamp
  approvedAt?: Timestamp
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [activeTab, setActiveTab] = useState('pending')

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'drivers'), snap => {
      const driverData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Driver))
      driverData.sort((a, b) => (b.submittedAt?.seconds ?? 0) - (a.submittedAt?.seconds ?? 0))
      setDrivers(driverData)
    })
    return unsub
  }, [])

  const pendingDrivers = drivers.filter(
    d => d.status === 'pending_review' || d.status === 'rejected' || d.status === 'incomplete'
  )
  const approvedDrivers = drivers.filter(
    d => d.status === 'approved' || d.status === 'suspended'
  )

  async function handleApprove(id: string) {
    await updateDoc(doc(db, 'drivers', id), {
      status: 'approved',
      approvedAt: serverTimestamp(),
      rejectionReason: null,
    })
    setSelectedDriver(null)
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) return
    await updateDoc(doc(db, 'drivers', id), {
      status: 'rejected',
      rejectionReason: rejectReason,
    })
    setRejectDialogOpen(false)
    setRejectReason('')
    setSelectedDriver(null)
  }

  async function handleSuspend(id: string) {
    await updateDoc(doc(db, 'drivers', id), { status: 'suspended' })
    setSelectedDriver(null)
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Drivers</h1>
          <p className="text-zinc-500 text-sm mt-1">Review and manage driver applications</p>
        </div>
        <div className="flex items-center gap-2">
          {pendingDrivers.length > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">
              {pendingDrivers.length} pending
            </span>
          )}
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600">
            {approvedDrivers.length} approved
          </span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending Review
            {pendingDrivers.length > 0 && (
              <span className="ml-2 text-xs bg-yellow-500 text-white px-1.5 py-0.5 rounded-full">
                {pendingDrivers.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">Approved Drivers</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          <div className="grid gap-4">
            {pendingDrivers.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No pending applications</p>
                </CardContent>
              </Card>
            ) : (
              pendingDrivers.map(driver => (
                <Card
                  key={driver.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedDriver(driver)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#C8880A]/10 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-[#C8880A]" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{driver.name || 'Unnamed driver'}</h3>
                          <p className="text-sm text-muted-foreground">
                            {driver.vehicleType} · {driver.vehicleReg}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {driver.submittedAt
                              ? `Applied ${new Date(driver.submittedAt.seconds * 1000).toLocaleDateString()}`
                              : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={driver.status} />
                        <Button size="sm" variant="outline">Review</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="approved" className="mt-6">
          <div className="grid gap-4">
            {approvedDrivers.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Car className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No approved drivers yet</p>
                </CardContent>
              </Card>
            ) : (
              approvedDrivers.map(driver => (
                <Card
                  key={driver.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedDriver(driver)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                          <Car className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{driver.name || 'Unnamed driver'}</h3>
                          <p className="text-sm text-muted-foreground">
                            {driver.vehicleType} · {driver.vehicleReg}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {driver.isOnline ? (
                              <span className="text-green-600 flex items-center gap-1">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                Online now
                              </span>
                            ) : (
                              'Offline'
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={driver.status} />
                        <Button size="sm" variant="outline">View</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Driver Details Dialog */}
      <Dialog open={!!selectedDriver} onOpenChange={() => setSelectedDriver(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedDriver && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <StatusBadge status={selectedDriver.status} />
                  <span>{selectedDriver.name || 'Unnamed driver'}</span>
                </DialogTitle>
                <DialogDescription>
                  Driver ID: {selectedDriver.id.substring(0, 8)}...
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Personal Info */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase">
                    Personal Information
                  </h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span>{selectedDriver.name || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span>{selectedDriver.phone || '—'}</span>
                    </div>
                    {selectedDriver.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedDriver.email}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span>{selectedDriver.idType === 'passport' ? 'Passport' : 'ID'}: {selectedDriver.idNumber || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Vehicle Info */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase">
                    Vehicle Information
                  </h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4 text-muted-foreground" />
                      <span>{selectedDriver.vehicleType || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span>Reg: {selectedDriver.vehicleReg || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <BadgeIcon className="w-4 h-4 text-muted-foreground" />
                      <span>Licence: {selectedDriver.licenceNumber || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Rejection Reason */}
                {selectedDriver.rejectionReason && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <h4 className="font-semibold text-sm text-red-600 mb-1">
                      Rejection Reason
                    </h4>
                    <p className="text-sm text-red-700">
                      {selectedDriver.rejectionReason}
                    </p>
                  </div>
                )}

                {/* Timeline */}
                <div className="space-y-2 text-xs text-muted-foreground">
                  {selectedDriver.submittedAt && (
                    <p>Applied: {new Date(selectedDriver.submittedAt.seconds * 1000).toLocaleString()}</p>
                  )}
                  {selectedDriver.approvedAt && (
                    <p>Approved: {new Date(selectedDriver.approvedAt.seconds * 1000).toLocaleString()}</p>
                  )}
                </div>
              </div>

              <DialogFooter className="flex gap-2">
                {(selectedDriver.status === 'pending_review' || selectedDriver.status === 'incomplete') && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setRejectDialogOpen(true)}
                      className="border-red-500 text-red-600 hover:bg-red-50"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => handleApprove(selectedDriver.id)}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                  </>
                )}
                {selectedDriver.status === 'rejected' && (
                  <Button
                    onClick={() => handleApprove(selectedDriver.id)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve (Override)
                  </Button>
                )}
                {selectedDriver.status === 'approved' && (
                  <Button
                    variant="outline"
                    onClick={() => handleSuspend(selectedDriver.id)}
                    className="border-red-500 text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Suspend Driver
                  </Button>
                )}
                {selectedDriver.status === 'suspended' && (
                  <Button
                    onClick={() => handleApprove(selectedDriver.id)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Reinstate Driver
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejection. This will be shown to the driver.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reason">Rejection Reason</Label>
            <Input
              id="reason"
              placeholder="e.g., Licence expired, incomplete documents..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedDriver && handleReject(selectedDriver.id)}
              disabled={!rejectReason.trim()}
            >
              Reject Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
