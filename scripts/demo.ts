// usage: npx ts-node scripts/demo.ts

async function main(){
  console.log('1) Minting sample invoice...');
  console.log('tx: https://explorer.solana.com/tx/<devnet_tx_id>?cluster=devnet');

  console.log('2) Simulating investor funding via USDC transfer...');
  console.log('tx: https://explorer.solana.com/tx/<devnet_tx_id2>?cluster=devnet');

  console.log('3) Simulating buyer payment webhook → settlement');
  console.log('tx: https://explorer.solana.com/tx/<devnet_tx_id3>?cluster=devnet');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
