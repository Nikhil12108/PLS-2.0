import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-display' })

export const metadata: Metadata = {
  title: 'KrystelisClearAI Dashboard',
  description: 'AI powered document parsing dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="light">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} bg-[var(--color-background-light)] dark:bg-[var(--color-background-dark)] text-slate-900 dark:text-slate-100 antialiased h-screen overflow-hidden`}>
        {children}
      </body>
    </html>
  )
}
