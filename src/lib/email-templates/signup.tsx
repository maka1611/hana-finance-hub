import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from '@react-email/components'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="ru" dir="ltr">
    <Head />
    <Preview>Подтвердите вашу почту в {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Подтвердите вашу почту</Heading>
        <Text style={text}>
          Спасибо за регистрацию в{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          .
        </Text>
        <Text style={text}>
          Подтвердите ваш email (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ), нажав на кнопку ниже:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Подтвердить email
        </Button>
        <Text style={footer}>
          Если вы не регистрировались — просто проигнорируйте это письмо.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0d0d0d',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const link = { color: '#065f46', textDecoration: 'underline' }
const button = {
  backgroundColor: '#065f46',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
