import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'ClearPath Review',description:'A clear path from first draft to human approval. Fictional marketing review workspace.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
