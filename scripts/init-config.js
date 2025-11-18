'use strict';

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const anchor = require('@coral-xyz/anchor');

const { web3, AnchorProvider, Wallet, Program } = anchor;

const DEFAULT_COMMITMENT = 'confirmed';

function loadKeypair(path) {
  const raw = readFileSync(path, 'utf8');
  const secret = JSON.parse(raw);
  const secretKey = Uint8Array.from(secret);
  return web3.Keypair.fromSecretKey(secretKey);
}

function getConnection() {
  const url = process.env.CLUSTER_URL || 'https://api.devnet.solana.com';
  return new web3.Connection(url, DEFAULT_COMMITMENT);
}

function getProvider() {
  const kpPath = process.env.RELAYER_KEYPAIR_PATH;
  if (!kpPath) {
    throw new Error('RELAYER_KEYPAIR_PATH env var not set');
  }
  const keypair = loadKeypair(kpPath);
  const wallet = new Wallet(keypair);
  return new AnchorProvider(getConnection(), wallet, { commitment: DEFAULT_COMMITMENT });
}

function getProgram() {
  const idlPath = resolve(__dirname, '..', 'target', 'idl', 'invoice_manager.json');
  const idl = JSON.parse(readFileSync(idlPath, 'utf8'));
  const provider = getProvider();
  // Match backend/src/anchor.ts: construct Program from (idl, provider),
  // letting Anchor use idl.address as the program ID.
  return new Program(idl, provider);
}

async function main() {
  if (typeof fetch === 'undefined') {
    console.error('This script requires Node.js 18+ (global fetch).');
    process.exit(1);
  }

  const program = getProgram();
  const admin = program.provider.wallet.publicKey;

  // Derive global AdminConfig PDA
  const [configPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId,
  );

  console.log('Admin pubkey (from RELAYER_KEYPAIR_PATH):', admin.toBase58());
  console.log('Config PDA:', configPda.toBase58());

  const sig = await program.methods
    .initConfig(admin)
    .accounts({
      config: configPda,
      payer: admin,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  console.log('init_config tx:', sig);
  console.log('Explorer:', `https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
