use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWFK...replace_with_devnet_id");

#[program]
pub mod invoice_manager {
    use super::*;
    pub fn mint_invoice(ctx: Context<MintInvoice>, metadata_hash: String, amount: u64, due_date: i64) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        invoice.seller = *ctx.accounts.seller.key;
        invoice.amount = amount;
        invoice.metadata_hash = metadata_hash;
        invoice.due_date = due_date;
        invoice.status = InvoiceStatus::Open;
        Ok(())
    }

    pub fn set_settled(ctx: Context<SetSettled>) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        invoice.status = InvoiceStatus::Settled;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct MintInvoice<'info> {
    #[account(init, payer = seller, space = 8 + 200)]
    pub invoice: Account<'info, Invoice>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetSettled<'info> {
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    pub operator: Signer<'info>, // later: require multisig / verified relayer
}

#[account]
pub struct Invoice {
    pub seller: Pubkey,
    pub amount: u64,
    pub metadata_hash: String,
    pub due_date: i64,
    pub status: InvoiceStatus,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum InvoiceStatus {
    Open,
    Funded,
    Settled,
}
