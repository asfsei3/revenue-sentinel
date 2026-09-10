import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Revenue Sentinel', description: 'Autonomous payment revenue recovery control tower' };
export default function RootLayout({children}:{children:ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
