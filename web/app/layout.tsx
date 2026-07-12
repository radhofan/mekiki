import type { Metadata } from 'next';
import { Inter, Geist } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'HRFast — Local AI Hiring Engine',
  description: 'AI-powered applicant tracking system running 100% locally with Ollama.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en' className={cn("dark", "font-sans", geist.variable)}>
      <body className={`${inter.className} bg-[#0a0a0f] text-slate-100 min-h-screen`}>
        {/* ── Sidebar Nav ─────────────────────────────────────────────────── */}
        <div className='flex min-h-screen'>
          <aside className='w-60 shrink-0 border-r border-white/5 bg-[#0d0d14] flex flex-col py-8 px-4 gap-1'>
            {/* Logo */}
            <div className='mb-8 px-2'>
              <span className='text-xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent'>
                ⚡ HRFast
              </span>
              <p className='text-[10px] text-slate-500 mt-1 uppercase tracking-widest'>
                Local AI · Ollama
              </p>
            </div>

            <NavLink href='/' label='Dashboard' icon='◈' />
            <NavLink href='/roles' label='Job Roles' icon='◉' />
            <NavLink href='/upload' label='Upload CV' icon='⊕' />
            <NavLink href='/chatbot' label='Harry Chatbot' icon='💬' />

            <div className='mt-auto px-2 pt-8 border-t border-white/5'>
              <p className='text-[10px] text-slate-600'>v1.0.0 · HRFast</p>
            </div>
          </aside>

          {/* ── Main content ──────────────────────────────────────────────── */}
          <main className='flex-1 overflow-auto'>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className='flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-all duration-150 text-sm font-medium group'
    >
      <span className='text-violet-400 group-hover:text-cyan-400 transition-colors'>{icon}</span>
      {label}
    </Link>
  );
}
