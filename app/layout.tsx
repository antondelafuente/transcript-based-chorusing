import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { TranscriptProvider } from '@/app/contexts/transcript-context'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Transcript-based Chorusing',
  description: 'Practice language learning with transcript-based chorusing',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TranscriptProvider>
          {children}
          <Toaster />
        </TranscriptProvider>
      </body>
    </html>
  )
}
