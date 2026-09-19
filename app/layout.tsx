import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Revenue Sentinel', description: '自律型の売上回収とインシデント管理を行う Control Tower' };
export default function RootLayout({children}:{children:ReactNode}) { return <html lang="ja"><body>{children}</body></html>; }
