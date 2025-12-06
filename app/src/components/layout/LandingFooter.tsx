import React from 'react'

export function LandingFooter(){
  return (
    <footer className="border-t border-slate-800 bg-slate-950/90">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-5 text-[11px] text-slate-400 sm:px-6">
        <p className="text-center">
          © 2025 solana defi. built on solana by{' '}
          <a
            href="https://github.com/infantmen-labs"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-slate-500 underline-offset-2 hover:text-slate-200 hover:decoration-slate-300"
          >
            infantmen-labs
          </a>
          .
        </p>
        <div className="flex items-center gap-4 text-lg">
          <a
            href="https://twitter.com"
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 hover:text-sky-300"
            aria-label="Twitter"
          >
            <i className="fab fa-twitter" />
          </a>
          <a
            href="https://t.me"
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 hover:text-sky-300"
            aria-label="Telegram"
          >
            <i className="fab fa-telegram-plane" />
          </a>
          <a
            href="https://github.com/infantmen-labs/InvoiceLift"
            target="_blank"
            rel="noreferrer"
            className="text-slate-300 hover:text-white"
            aria-label="GitHub"
          >
            <i className="fab fa-github" />
          </a>
        </div>
      </div>
    </footer>
  )
}
