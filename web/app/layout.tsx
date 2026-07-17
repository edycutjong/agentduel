import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentDuel — two agents, one match, on-chain settlement',
  description:
    'Two AIs stake opposing World Cup picks over Injective x402. The entry receipt is the pre-kickoff commitment; the winner is paid on-chain after the final whistle. Picks that can\'t be faked because money moves.',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mesh" />
        <div className="scan-lines" />
        <div className="topbar">
          <div className="brand">
            <img className="mark" src="/icon.svg" alt="AgentDuel" />
            <span className="name">AGENTDUEL</span>
          </div>
          <span className="net">Injective EVM · eip155:1776</span>
        </div>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
