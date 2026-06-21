import * as admin from 'firebase-admin'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'

admin.initializeApp()
const db = admin.firestore()

// ─── FCM helpers ──────────────────────────────────────────────────────────────

/** Send to a customer — reads fcmToken from users/{userId} */
async function sendFCM(userId: string, title: string, body: string, data?: Record<string, string>) {
  try {
    const snap = await db.collection('users').doc(userId).get()
    const token = snap.data()?.fcmToken as string | undefined
    if (!token) return
    await admin.messaging().send({ token, notification: { title, body }, data })
  } catch (e) {
    console.error('FCM (user) error:', e)
  }
}

/** Send to a restaurant owner — reads fcmToken from restaurants/{restaurantId} */
async function sendFCMToRestaurant(restaurantId: string, title: string, body: string, data?: Record<string, string>) {
  try {
    const snap = await db.collection('restaurants').doc(restaurantId).get()
    const token = snap.data()?.fcmToken as string | undefined
    if (!token) return
    await admin.messaging().send({ token, notification: { title, body }, data })
  } catch (e) {
    console.error('FCM (restaurant) error:', e)
  }
}

/**
 * Broadcast to every driver currently subscribed to the 'available_drivers'
 * topic. Symon's Kitchen uses a claim model — any online driver can accept a
 * 'driver_assigned' order, so we notify all of them rather than a single one.
 */
async function sendFCMToDriversTopic(title: string, body: string, data?: Record<string, string>) {
  try {
    await admin.messaging().send({ topic: 'available_drivers', notification: { title, body }, data })
  } catch (e) {
    console.error('FCM (drivers topic) error:', e)
  }
}

// ─── 1. notifyNewOrder ─────────────────────────────────────────────────────────
// Fires when a customer places a new order — alerts the restaurant owner.
export const notifyNewOrder = onDocumentCreated('orders/{orderId}', async (event) => {
  const order = event.data?.data()
  if (!order) return
  if (order.status !== 'placed') return

  const restaurantId = order.restaurantId as string | undefined
  if (!restaurantId) return

  await sendFCMToRestaurant(
    restaurantId,
    '🛎️ New Order!',
    `New order received — R${order.total}.`,
    { orderId: event.params.orderId, restaurantId, type: 'new_order' }
  )
})

// ─── 2. notifyOrderStatus ───────────────────────────────────────────────────────
// Fires on every order status change — pushes FCM to the customer.
export const notifyOrderStatus = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return
  if (before.status === after.status) return

  const MESSAGES: Record<string, { title: string; body: string }> = {
    confirmed:        { title: '👍 Order accepted!', body: 'The restaurant is preparing your order.' },
    preparing:        { title: '👨‍🍳 Preparing your order', body: 'Your food is being made fresh.' },
    driver_assigned:  { title: '📦 Order ready!', body: "We're finding a driver to deliver your order." },
    out_for_delivery: { title: '🚗 On the way!', body: 'Your driver has picked up your order.' },
    delivered:        { title: '🎉 Delivered!', body: 'Your order has arrived. Enjoy!' },
    cancelled:        { title: '❌ Order cancelled', body: 'Your order has been cancelled.' },
  }

  const msg = MESSAGES[after.status]
  if (!msg || !after.customerId) return

  await sendFCM(
    after.customerId as string,
    msg.title,
    msg.body,
    { orderId: event.params.orderId, status: after.status as string, type: 'order_update' }
  )
})

// ─── 3. notifyDriversNewDelivery ────────────────────────────────────────────────
// Fires when an order becomes 'driver_assigned' (restaurant marked it ready) —
// broadcasts to all online drivers so any of them can claim it.
export const notifyDriversNewDelivery = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return
  if (before.status === after.status) return
  if (after.status !== 'driver_assigned') return

  await sendFCMToDriversTopic(
    '🛵 New Delivery Available!',
    `Pickup from ${after.restaurantName ?? 'a restaurant'}`,
    { orderId: event.params.orderId, type: 'new_delivery' }
  )
})

// ─── 4. notifyCancellationRequest ───────────────────────────────────────────────
// Fires when a customer requests cancellation — alerts the restaurant owner.
export const notifyCancellationRequest = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return
  if (before.status === after.status) return
  if (after.status !== 'cancellation_requested') return

  const restaurantId = after.restaurantId as string | undefined
  if (!restaurantId) return

  const customerName = (after.customerName as string | undefined) ?? 'A customer'
  const reason = (after.cancellationReason as string | undefined) ?? 'No reason given'

  await sendFCMToRestaurant(
    restaurantId,
    '⚠️ Cancellation Request',
    `${customerName} wants to cancel their order. Reason: ${reason}`,
    { orderId: event.params.orderId, restaurantId, type: 'cancellation_request' }
  )
})

// ─── 5. notifyRestaurantApproved ────────────────────────────────────────────────
// Fires when admin approves a restaurant (status: pending → active).
export const notifyRestaurantApproved = onDocumentUpdated('restaurants/{restaurantId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return
  if (before.status === after.status) return
  if (after.status !== 'active') return

  await sendFCMToRestaurant(
    event.params.restaurantId,
    "🎉 You're approved!",
    "Your restaurant is now live on Symon's Kitchen.",
    { type: 'restaurant_approved' }
  )
})

// ─── Paystack helpers ─────────────────────────────────────────────────────────

const PAYSTACK_API = 'https://api.paystack.co'

async function getPaystackSecretKey(): Promise<string> {
  const snap = await db.collection('settings').doc('paystack').get()
  const key = snap.data()?.secretKey as string | undefined
  if (!key) throw new HttpsError('failed-precondition', 'Paystack secret key not configured. Add it in Admin → Settings.')
  return key
}

/** Initiates a single Paystack Transfer. Returns the parsed Paystack response. */
async function sendPaystackTransfer(
  secretKey: string, recipientCode: string, amountRands: number, reason: string,
): Promise<{ status: boolean; message: string; data?: { transfer_code: string; status: string } }> {
  const res = await fetch(`${PAYSTACK_API}/transfer`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'balance',
      amount: Math.round(amountRands * 100),
      recipient: recipientCode,
      reason,
    }),
  })
  return res.json() as Promise<{ status: boolean; message: string; data?: { transfer_code: string; status: string } }>
}

// ─── 5. initializePayment ─────────────────────────────────────────────────────
// Creates a Paystack transaction and a pending order in Firestore.
// Called from the Flutter cart screen just before opening the checkout.
export const initializePayment = onCall(
  { region: 'africa-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Not authenticated.')

    const {
      restaurantId, restaurantName,
      amountRands, items,
      deliveryAddress, deliveryFee,
      deliveryLat, deliveryLng,
      customerName, successBaseUrl,
    } = request.data as {
      restaurantId: string
      restaurantName: string
      amountRands: number
      items: Array<{ name: string; quantity: number; price: number }>
      deliveryAddress: string
      deliveryFee: number
      deliveryLat?: number
      deliveryLng?: number
      customerName?: string
      successBaseUrl?: string
    }

    const secretKey = await getPaystackSecretKey()
    const uid = request.auth.uid
    // Paystack requires a customer email; fall back to a deterministic address.
    const email = (request.auth.token.email as string | undefined) ?? `${uid}@symonskitchen.app`
    const reference = `SK-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`
    const amountCents = Math.round(amountRands * 100)
    const subtotal = amountRands - deliveryFee

    // Pre-generate the order document ID so we can embed it in the callback URL.
    const orderRef = db.collection('orders').doc()
    const orderId = orderRef.id

    // Paystack appends ?reference=...&trxref=... to the callback URL. On web we
    // send the Flutter app's success route; on mobile the WebView intercepts
    // the placeholder domain before it resolves.
    const callbackUrl = successBaseUrl
      ? `${successBaseUrl}?orderId=${orderId}`
      : 'https://symonskitchen.app/payment/success'

    const psRes = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amountCents,
        currency: 'ZAR',
        reference,
        callback_url: callbackUrl,
        metadata: { orderId, restaurantId, customerId: uid, customerName: customerName ?? null },
      }),
    })

    const ps = await psRes.json() as {
      status: boolean
      message: string
      data?: { authorization_url: string; access_code: string; reference: string }
    }
    if (!ps.status || !ps.data) {
      console.error('Paystack init failed:', ps.message)
      throw new HttpsError('internal', ps.message || 'Could not start payment.')
    }

    // Create the pending order using the pre-generated ref
    await orderRef.set({
      customerId:       uid,
      customerEmail:    email,
      customerName:     customerName ?? null,
      restaurantId,
      restaurantName,
      items,
      subtotal,
      deliveryFee,
      total:            amountRands,
      deliveryAddress,
      ...(deliveryLat != null && { deliveryLat }),
      ...(deliveryLng != null && { deliveryLng }),
      status:           'pending_payment',
      paymentStatus:    'pending',
      paymentReference: reference,
      createdAt:        admin.firestore.FieldValue.serverTimestamp(),
    })

    return {
      authorizationUrl: ps.data.authorization_url,
      reference,
      orderId,
    }
  }
)

// ─── 6. verifyPayment ─────────────────────────────────────────────────────────
// Called from Flutter after checkout. Confirms the charge with Paystack,
// promotes the order to 'placed', and notifies customer + restaurant.
export const verifyPayment = onCall(
  { region: 'africa-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Not authenticated.')

    const { orderId, reference: providedReference } = request.data as { orderId: string; reference?: string }
    if (!orderId) throw new HttpsError('invalid-argument', 'orderId is required.')

    // Fetch and idempotency-check the order
    const orderSnap = await db.collection('orders').doc(orderId).get()
    const order = orderSnap.data()
    if (!order) throw new HttpsError('not-found', 'Order not found.')

    // reference may come from the caller or be looked up from the order doc
    const reference = providedReference || (order.paymentReference as string | undefined)
    if (!reference) throw new HttpsError('failed-precondition', 'No payment reference for this order.')

    const secretKey = await getPaystackSecretKey()

    // Verify the transaction with Paystack
    const psRes = await fetch(`${PAYSTACK_API}/transaction/verify/${reference}`, {
      headers: { 'Authorization': `Bearer ${secretKey}` },
    })
    const ps = await psRes.json() as { status: boolean; message: string; data?: { status: string } }
    if (!ps.status || !ps.data) {
      console.error('Paystack verify failed:', ps.message)
      throw new HttpsError('internal', 'Could not verify payment with Paystack.')
    }

    if (ps.data.status !== 'success') {
      console.warn(`Paystack transaction ${reference} status: ${ps.data.status}`)
      return { status: ps.data.status, orderId }
    }

    if (order.status !== 'pending_payment') {
      // Already processed (prior verify call)
      return { status: order.status, orderId }
    }

    // Promote to placed
    await db.collection('orders').doc(orderId).update({
      status:        'placed',
      paymentStatus: 'paid',
      paidAt:        admin.firestore.FieldValue.serverTimestamp(),
    })

    // Notify restaurant owner — new order waiting
    if (order.restaurantId) {
      await sendFCMToRestaurant(
        order.restaurantId as string,
        '🛎️ New Order!',
        `Payment confirmed — R${order.total} order is waiting for you.`,
        { orderId, restaurantId: order.restaurantId as string, type: 'new_order' }
      )
    }

    // Notify customer — payment confirmed
    await sendFCM(
      request.auth.uid,
      '✅ Payment confirmed!',
      'Your order is confirmed and the restaurant has been notified.',
      { orderId, type: 'order_confirmed' }
    )

    return { status: 'placed', orderId }
  }
)

// ─── 7. processRefund ──────────────────────────────────────────────────────────
// Called by the restaurant when they confirm a customer's cancellation request.
// Calls Paystack's Refund API then marks the order cancelled + notifies the customer.
export const processRefund = onCall(
  { region: 'africa-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Not authenticated.')

    const { orderId } = request.data as { orderId: string }
    if (!orderId) throw new HttpsError('invalid-argument', 'orderId is required.')

    const orderSnap = await db.collection('orders').doc(orderId).get()
    const order = orderSnap.data()
    if (!order) throw new HttpsError('not-found', 'Order not found.')
    if (order.status !== 'cancellation_requested') {
      throw new HttpsError('failed-precondition', 'Order is not pending cancellation.')
    }

    // Attempt Paystack refund. Non-blocking — if it fails we still cancel the
    // order and notify the customer, flagging it refund_pending for follow-up.
    const reference = order.paymentReference as string | undefined
    let paymentStatus = 'cancelled'

    if (reference) {
      try {
        const secretKey = await getPaystackSecretKey()
        const amountCents = Math.round((order.total as number) * 100)
        const refundRes = await fetch(`${PAYSTACK_API}/refund`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ transaction: reference, amount: amountCents }),
        })
        const refund = await refundRes.json() as { status: boolean; message: string }
        if (refund.status) {
          paymentStatus = 'refunded'
          console.log(`Paystack refund initiated for ${reference}, R${order.total}`)
        } else {
          console.error(`Paystack refund failed for ${reference}:`, refund.message)
          paymentStatus = 'refund_pending'
        }
      } catch (e) {
        console.error('Paystack refund error:', e)
        paymentStatus = 'refund_pending'
      }
    }

    // Always cancel the order regardless of the refund result
    await db.collection('orders').doc(orderId).update({
      status:        'cancelled',
      paymentStatus,
      refundedAt:    admin.firestore.FieldValue.serverTimestamp(),
    })

    // Notify customer — always
    if (order.customerId) {
      const refundMsg = paymentStatus === 'refunded'
        ? `Your refund of R${(order.total as number).toFixed(2)} is on the way. Allow 3–5 business days.`
        : `Your order has been cancelled. Your refund of R${(order.total as number).toFixed(2)} will be processed shortly.`
      await sendFCM(
        order.customerId as string,
        '✅ Cancellation Confirmed',
        refundMsg,
        { orderId, type: 'refund_initiated' }
      )
    }

    return { status: 'cancelled', paymentStatus, orderId }
  }
)

// ─── 8. registerPaystackRecipient ─────────────────────────────────────────────
// Registers a driver's bank account with Paystack and stores the recipient code
// on their driver doc so future payouts can be processed instantly.
export const registerPaystackRecipient = onCall(
  { region: 'africa-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Not authenticated.')

    const { accountNumber, bankCode, bankName, accountName } = request.data as {
      accountNumber: string
      bankCode: string
      bankName: string
      accountName: string
    }

    const secretKey = await getPaystackSecretKey()

    const res = await fetch(`${PAYSTACK_API}/transferrecipient`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'nuban',
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: 'ZAR',
      }),
    })

    const data = await res.json() as { status: boolean; message: string; data: { recipient_code: string } }
    if (!data.status) {
      console.error('Paystack recipient registration failed:', data.message)
      throw new HttpsError('internal', data.message || 'Failed to register bank account with Paystack.')
    }

    const recipientCode = data.data.recipient_code

    await db.collection('drivers').doc(request.auth.uid).update({
      bankName,
      bankCode,
      bankAccountNumber: accountNumber,
      paystackRecipientCode: recipientCode,
      bankUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    return { recipientCode }
  }
)

// ─── 9. resolveBankAccount ────────────────────────────────────────────────────
// Validates a driver's bank account with Paystack and returns the registered
// account-holder name, so the driver can confirm before saving.
export const resolveBankAccount = onCall(
  { region: 'africa-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Not authenticated.')

    const { accountNumber, bankCode } = request.data as {
      accountNumber: string
      bankCode: string
    }
    if (!accountNumber || !bankCode) throw new HttpsError('invalid-argument', 'Account number and bank are required.')

    const secretKey = await getPaystackSecretKey()
    const res = await fetch(
      `${PAYSTACK_API}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
      { headers: { 'Authorization': `Bearer ${secretKey}` } }
    )
    const data = await res.json() as { status: boolean; message: string; data?: { account_name: string } }
    if (!data.status || !data.data) {
      console.error('Paystack account resolve failed:', data.message)
      throw new HttpsError('invalid-argument', data.message || 'Could not verify this bank account.')
    }

    return { accountName: data.data.account_name }
  }
)

// ─── 10. payDriverForDelivery ─────────────────────────────────────────────────
// Fires when an order is marked 'delivered'. Automatically transfers that
// order's delivery fee to the driver's registered bank account via Paystack —
// no manual withdrawal needed. Each order pays out exactly once (idempotent via
// payoutDone flag).
export const payDriverForDelivery = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return
  if (before.status === after.status) return
  if (after.status !== 'delivered') return
  if (after.payoutDone === true) return // already paid out

  const orderId = event.params.orderId
  const driverId = after.driverId as string | undefined
  const deliveryFee = (after.deliveryFee as number | undefined) ?? 0
  if (!driverId || deliveryFee <= 0) return

  // Mark immediately to prevent double-payout on rapid re-triggers
  await db.collection('orders').doc(orderId).update({ payoutDone: true })

  const driverSnap = await db.collection('drivers').doc(driverId).get()
  const driver = driverSnap.data()

  const recordPayout = (status: string, transferCode?: string) =>
    db.collection('payouts').add({
      driverId,
      driverName:           driver?.name ?? '',
      orderId,
      amountRands:          deliveryFee,
      status,
      ...(transferCode ? { paystackTransferCode: transferCode } : {}),
      bankName:             driver?.bankName ?? '',
      bankAccountNumber:    driver?.bankAccountNumber ?? '',
      createdAt:            admin.firestore.FieldValue.serverTimestamp(),
    })

  const notifyDriver = (title: string, body: string) => {
    const token = driver?.fcmToken as string | undefined
    if (!token) return Promise.resolve()
    return admin.messaging().send({ token, notification: { title, body }, data: { type: 'payout', orderId } })
      .catch(e => console.error('Driver payout FCM error:', e))
  }

  // No bank account registered yet → record as pending, prompt the driver
  const recipientCode = driver?.paystackRecipientCode as string | undefined
  if (!recipientCode) {
    await recordPayout('recipient_missing')
    await notifyDriver('⚠️ Add your bank account', `You earned R${deliveryFee.toFixed(2)} — add your bank details to receive it.`)
    return
  }

  // Initiate the Paystack transfer
  try {
    const secretKey = await getPaystackSecretKey()
    const data = await sendPaystackTransfer(
      secretKey, recipientCode, deliveryFee, `Symon's Kitchen delivery payout - order ${orderId}`,
    )

    if (data.status && data.data) {
      await recordPayout(data.data.status === 'success' ? 'success' : data.data.status, data.data.transfer_code)
      await notifyDriver('💸 Payout sent', `R${deliveryFee.toFixed(2)} for your delivery is on its way to your bank.`)
    } else {
      console.error(`Paystack transfer failed for order ${orderId}:`, data.message)
      await recordPayout('failed')
      await notifyDriver('Payout pending', `We couldn't send your R${deliveryFee.toFixed(2)} payout yet. It will be retried automatically.`)
    }
  } catch (e) {
    console.error(`Paystack transfer error for order ${orderId}:`, e)
    await recordPayout('failed')
  }
})

// ─── 11. retryFailedPayouts ───────────────────────────────────────────────────
// Runs on a schedule and re-attempts every payout that hasn't succeeded yet
// (status 'failed' or 'recipient_missing'). This makes payouts fully automatic:
// once the Paystack account is approved for Transfers — or once a driver finally
// adds their bank account — the next run clears the backlog with no manual step.
// NOTE: Cloud Scheduler is not available in africa-south1, so this scheduled
// function runs in europe-west1. It still reads/writes the same Firestore.
export const retryFailedPayouts = onSchedule(
  { schedule: 'every 3 hours', region: 'europe-west1' },
  async () => {
    const snap = await db
      .collection('payouts')
      .where('status', 'in', ['failed', 'recipient_missing'])
      .get()

    if (snap.empty) {
      console.log('retryFailedPayouts: nothing to retry')
      return
    }

    let secretKey: string
    try {
      secretKey = await getPaystackSecretKey()
    } catch (e) {
      console.error('retryFailedPayouts: no Paystack key configured', e)
      return
    }

    for (const doc of snap.docs) {
      const payout = doc.data()
      const driverId = payout.driverId as string | undefined
      const amountRands = (payout.amountRands as number | undefined) ?? 0
      if (!driverId || amountRands <= 0) continue

      // Re-read the driver to pick up a bank account added since the last attempt
      const driverSnap = await db.collection('drivers').doc(driverId).get()
      const driver = driverSnap.data()
      const recipientCode = driver?.paystackRecipientCode as string | undefined
      if (!recipientCode) continue // still no bank account — leave as recipient_missing

      try {
        const data = await sendPaystackTransfer(
          secretKey, recipientCode, amountRands,
          `Symon's Kitchen delivery payout (retry) - order ${payout.orderId ?? doc.id}`,
        )

        if (data.status && data.data) {
          await doc.ref.update({
            status: data.data.status === 'success' ? 'success' : data.data.status,
            paystackTransferCode: data.data.transfer_code,
            bankName: driver?.bankName ?? payout.bankName ?? '',
            bankAccountNumber: driver?.bankAccountNumber ?? payout.bankAccountNumber ?? '',
            retryCount: (payout.retryCount ?? 0) + 1,
            lastRetryAt: admin.firestore.FieldValue.serverTimestamp(),
          })

          const token = driver?.fcmToken as string | undefined
          if (token) {
            await admin.messaging().send({
              token,
              notification: {
                title: '💸 Payout sent',
                body: `Your R${amountRands.toFixed(2)} delivery payout is on its way to your bank.`,
              },
              data: { type: 'payout' },
            }).catch(e => console.error('retry payout FCM error:', e))
          }
          console.log(`retryFailedPayouts: paid out ${doc.id} (R${amountRands})`)
        } else {
          await doc.ref.update({
            retryCount: (payout.retryCount ?? 0) + 1,
            lastRetryAt: admin.firestore.FieldValue.serverTimestamp(),
          })
          console.warn(`retryFailedPayouts: still failing ${doc.id}: ${data.message}`)
        }
      } catch (e) {
        console.error(`retryFailedPayouts: error on ${doc.id}`, e)
      }
    }
  }
)

// ─── 12. mapsProxy ────────────────────────────────────────────────────────────
// Proxies Google Maps web-service calls (Directions / Geocoding / Places) so the
// Flutter WEB build can use them. Those APIs don't return CORS headers, so a
// browser can't call them directly; a server can. Mobile calls Google directly.
const GOOGLE_MAPS_KEY = 'AIzaSyB4wHFe2xOgiBKAXmoENZbHwfa-bMQaE-U'
const ALLOWED_MAPS_ENDPOINTS = new Set([
  'directions/json',
  'geocode/json',
  'place/autocomplete/json',
  'place/details/json',
])

export const mapsProxy = onCall(
  { region: 'africa-south1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Not authenticated.')

    const { endpoint, params } = request.data as {
      endpoint: string
      params: Record<string, string>
    }
    if (!ALLOWED_MAPS_ENDPOINTS.has(endpoint)) {
      throw new HttpsError('invalid-argument', 'Endpoint not allowed.')
    }

    const usp = new URLSearchParams({ ...(params || {}), key: GOOGLE_MAPS_KEY })
    const res = await fetch(`https://maps.googleapis.com/maps/api/${endpoint}?${usp.toString()}`)
    if (!res.ok) {
      console.error(`mapsProxy ${endpoint} failed: ${res.status}`)
      throw new HttpsError('internal', 'Maps request failed.')
    }
    return res.json()
  }
)
