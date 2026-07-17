/**
 * spawn-duelists.ts — born broke, funded cross-chain (runbook; funds-gated).
 *
 *   npm run spawn-duelists            # generate 2 ephemeral wallets + CCTP checklist
 *
 * The spec uses the Injective MCP `wallet_generate`; a headless script generates
 * the same EOA keypairs with viem. Only the ADDRESSES are written to
 * fixtures/duelists.json (idempotent — reuses existing). Private keys are printed
 * ONCE to stdout so you can paste them into .env.local (gitignored) — NEVER
 * committed. Funding is the funds-gated step: CCTP 0.50 USDC each from Base.
 */
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { PATHS, CCTP, NET, explorerAddress, STAKE_USDC } from '../config';

interface DuelistsFile {
  generated_at: string;
  note: string;
  red: { address: string };
  cyan: { address: string };
}

function loadExisting(): DuelistsFile | null {
  if (!fs.existsSync(PATHS.duelists)) return null;
  try {
    return JSON.parse(fs.readFileSync(PATHS.duelists, 'utf8'));
  } catch {
    return null;
  }
}

function spawn(): { address: string; pk: string } {
  const pk = generatePrivateKey();
  return { address: privateKeyToAccount(pk).address, pk };
}

function main(): void {
  let file = loadExisting();
  let redPk: string | null = null;
  let cyanPk: string | null = null;

  if (file) {
    console.log('reusing existing fixtures/duelists.json (idempotent):');
  } else {
    const red = spawn();
    const cyan = spawn();
    redPk = red.pk;
    cyanPk = cyan.pk;
    file = {
      generated_at: new Date().toISOString(),
      note: 'Ephemeral demo duelists (viem keygen; equivalent to MCP wallet_generate). Addresses only are stored here. Fund via CCTP from Base — funds-gated.',
      red: { address: red.address },
      cyan: { address: cyan.address },
    };
    fs.writeFileSync(PATHS.duelists, JSON.stringify(file, null, 2));
    console.log('generated 2 ephemeral duelists → fixtures/duelists.json (addresses only):');
  }

  console.log(`  🔴 RED  ${file.red.address}   ${explorerAddress(file.red.address)}`);
  console.log(`  🔵 CYAN ${file.cyan.address}   ${explorerAddress(file.cyan.address)}`);

  if (redPk && cyanPk) {
    console.log('\n  ⚠️  PRIVATE KEYS (printed ONCE — paste into .env.local, NEVER commit):');
    console.log(`      RED_PK=${redPk}`);
    console.log(`      CYAN_PK=${cyanPk}`);
  }

  console.log('\n  CCTP funding runbook (funds-gated — needs USDC on Base + gas):');
  console.log(`    each duelist needs ~${(STAKE_USDC + 0.4).toFixed(2)} USDC on ${NET.name} (${NET.caip2}).`);
  console.log('    1. Injective MCP `cctp_supported_chains` → confirm Base source domain ' + CCTP.baseSourceDomain);
  console.log(`    2. burn on Base via TokenMessengerV2 ${CCTP.tokenMessengerV2}`);
  console.log(`    3. poll Iris ${CCTP.attestationApi} → \`cctp_attestation_status\``);
  console.log('    4. `cctp_mint` on Injective → each duelist now holds USDC');
  console.log('    5. verify with MCP `account_balances { address }`');
  console.log('\n  Then: `npm run red -- --pay` and `npm run cyan -- --pay` to stake the entries on-chain.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
