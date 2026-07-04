import * as React from 'react'
import { render } from '@react-email/components'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'NoorPay'
const SENDER_DOMAIN = 'notify.noorpay.ru'
const FROM_DOMAIN = 'notify.noorpay.ru'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

interface SendArgs {
  templateName: string
  recipientEmail: string
  idempotencyKey?: string
  templateData?: Record<string, unknown>
}

/**
 * Server-only helper to enqueue a transactional email from within
 * other server functions (createInstallment / adminCreateInstallment).
 * Mirrors the public /lovable/email/transactional/send route but uses
 * supabaseAdmin so no user JWT is needed.
 */
export async function sendTransactionalEmailServer({
  templateName,
  recipientEmail,
  idempotencyKey,
  templateData = {},
}: SendArgs): Promise<{ ok: boolean; reason?: string }> {
  const template = TEMPLATES[templateName]
  if (!template) {
    console.error('Template not found', { templateName })
    return { ok: false, reason: 'template_not_found' }
  }
  const effectiveRecipient = (template.to || recipientEmail || '').trim()
  if (!effectiveRecipient) return { ok: false, reason: 'no_recipient' }

  const normalized = effectiveRecipient.toLowerCase()
  const messageId = crypto.randomUUID()
  const idemKey = idempotencyKey || messageId

  // Suppression check
  const { data: suppressed } = await supabaseAdmin
    .from('suppressed_emails')
    .select('id')
    .eq('email', normalized)
    .maybeSingle()
  if (suppressed) return { ok: false, reason: 'suppressed' }

  // Unsubscribe token (one per email)
  let unsubscribeToken: string
  const { data: existingToken } = await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalized)
    .maybeSingle()
  if (existingToken && !existingToken.used_at) {
    unsubscribeToken = existingToken.token
  } else if (!existingToken) {
    unsubscribeToken = generateToken()
    await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: normalized },
        { onConflict: 'email', ignoreDuplicates: true },
      )
    const { data: stored } = await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalized)
      .maybeSingle()
    if (stored?.token) unsubscribeToken = stored.token
  } else {
    return { ok: false, reason: 'suppressed' }
  }

  // Render
  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const plainText = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function'
      ? template.subject(templateData as Record<string, unknown>)
      : template.subject

  // Log pending
  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabaseAdmin.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text: plainText,
      purpose: 'transactional',
      label: templateName,
      idempotency_key: idemKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('enqueue_email failed', { error: enqueueError })
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })
    return { ok: false, reason: 'enqueue_failed' }
  }
  return { ok: true }
}

/**
 * Best-effort notification to an investor when a new installment contract
 * is funded from their capital. Safe to call multiple times for the same
 * contract — idempotency key prevents duplicates downstream.
 */
export async function notifyInvestorOfFundedContract(contractId: string) {
  try {
    const { data: contract } = await supabaseAdmin
      .from('installment_contracts')
      .select(
        'id, investor_id, product_name, principal, markup_amount, term_months, monthly_payment, start_date, investor_profit_locked, investor_profit_amount',
      )
      .eq('id', contractId)
      .maybeSingle()
    if (!contract || !contract.investor_id) return

    const { data: investor } = await supabaseAdmin
      .from('investors')
      .select('email, full_name, profit_share_rate, is_active')
      .eq('id', contract.investor_id)
      .maybeSingle()
    if (!investor?.email || !investor.is_active) return

    const shareRate = Number(investor.profit_share_rate ?? 0)
    const markup = Number(contract.markup_amount ?? 0)
    const locked = (contract as { investor_profit_locked?: boolean | null }).investor_profit_locked
    const lockedAmount = Number(
      (contract as { investor_profit_amount?: number | string | null }).investor_profit_amount ?? 0,
    )
    const expectedProfit = locked ? lockedAmount : markup * shareRate
    const effectiveShareRate = locked
      ? markup > 0
        ? lockedAmount / markup
        : shareRate
      : shareRate

    await sendTransactionalEmailServer({
      templateName: 'installment-funded-by-investor',
      recipientEmail: investor.email,
      idempotencyKey: `investor-funded-${contract.id}`,
      templateData: {
        investorName: investor.full_name?.split(' ')[0] ?? null,
        productName: contract.product_name,
        principal: Number(contract.principal ?? 0),
        termMonths: contract.term_months ?? null,
        monthlyPayment: Number(contract.monthly_payment ?? 0),
        startDate: contract.start_date,
        expectedProfit,
        profitShareRate: effectiveShareRate,
      },
    })
  } catch (err) {
    console.error('notifyInvestorOfFundedContract failed', err)
  }
}