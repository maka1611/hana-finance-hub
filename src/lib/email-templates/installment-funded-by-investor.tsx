import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'NoorPay'
const APP_URL = 'https://noorpay.ru/app/investor'

interface Props {
  investorName?: string
  productName?: string
  principal?: number
  termMonths?: number
  monthlyPayment?: number
  startDate?: string
  expectedProfit?: number
  profitShareRate?: number
}

const fmt = (n?: number) =>
  n === undefined || n === null
    ? '—'
    : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ' ₽'

const InstallmentFundedByInvestorEmail = ({
  investorName,
  productName,
  principal,
  termMonths,
  monthlyPayment,
  startDate,
  expectedProfit,
  profitShareRate,
}: Props) => (
  <Html lang="ru" dir="ltr">
    <Head />
    <Preview>Новая рассрочка профинансирована вашими средствами</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {investorName ? `${investorName}, ` : ''}новая рассрочка на ваши средства
        </Heading>
        <Text style={text}>
          В {SITE_NAME} оформлена новая рассрочка, профинансированная из вашего капитала.
        </Text>

        <Section style={card}>
          <Row label="Товар" value={productName ?? '—'} />
          <Row label="Сумма вложения" value={fmt(principal)} />
          <Row label="Срок" value={termMonths ? `${termMonths} мес.` : '—'} />
          <Row label="Ежемесячный платёж" value={fmt(monthlyPayment)} />
          <Row label="Дата старта" value={startDate ?? '—'} />
          {profitShareRate !== undefined && (
            <Row
              label="Ваша доля прибыли"
              value={`${Math.round(profitShareRate * 100)}%`}
            />
          )}
          {expectedProfit !== undefined && (
            <Row label="Ожидаемая прибыль" value={fmt(expectedProfit)} />
          )}
        </Section>

        <Button href={APP_URL} style={button}>
          Открыть кабинет инвестора
        </Button>

        <Hr style={hr} />
        <Text style={footer}>
          Команда {SITE_NAME}. Данные клиента не разглашаются.
        </Text>
      </Container>
    </Body>
  </Html>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <Text style={row}>
    <span style={rowLabel}>{label}: </span>
    <span style={rowValue}>{value}</span>
  </Text>
)

export const template = {
  component: InstallmentFundedByInvestorEmail,
  subject: 'Новая рассрочка профинансирована вашими средствами',
  displayName: 'Новая рассрочка на средства инвестора',
  previewData: {
    investorName: 'Иван',
    productName: 'iPhone 15',
    principal: 80000,
    termMonths: 12,
    monthlyPayment: 7500,
    startDate: '2026-06-15',
    expectedProfit: 5400,
    profitShareRate: 0.5,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px', margin: '0 auto' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold',
  color: '#0d0d0d',
  margin: '0 0 16px',
  lineHeight: '1.3',
}
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 20px' }
const card = {
  background: '#f6f8f5',
  border: '1px solid #e3e8df',
  borderRadius: '10px',
  padding: '16px 18px',
  margin: '0 0 24px',
}
const row = { fontSize: '14px', margin: '6px 0', color: '#1a1a1a' }
const rowLabel = { color: '#6b7280' }
const rowValue = { fontWeight: 600 as const }
const button = {
  backgroundColor: '#065f46',
  color: '#ffffff',
  padding: '12px 20px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 600 as const,
  fontSize: '14px',
  display: 'inline-block',
}
const hr = { borderColor: '#e5e7eb', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#9ca3af', margin: 0 }