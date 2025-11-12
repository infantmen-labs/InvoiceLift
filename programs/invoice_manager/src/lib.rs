use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, MintTo};
use anchor_spl::associated_token::AssociatedToken;

const METADATA_MAX_LEN: usize = 128;

declare_id!("F9X1Wm9yMvssSqm7Svv1UH7ZRe9YVdsffzW6krTemMDm");

#[program]
pub mod invoice_manager {
    use super::*;
    pub fn mint_invoice(
        ctx: Context<MintInvoice>,
        metadata_hash: String,
        amount: u64,
        due_date: i64,
    ) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        invoice.seller = *ctx.accounts.seller.key;
        invoice.amount = amount;
        invoice.metadata_hash = metadata_hash;
        invoice.due_date = due_date;
        invoice.status = InvoiceStatus::Open;
        invoice.usdc_mint = ctx.accounts.usdc_mint.key();
        invoice.funded_amount = 0;
        invoice.investor = Pubkey::default();
        invoice.escrow_bump = 0; // set on create_escrow
        invoice.shares_mint = Pubkey::default();
        Ok(())
    }

    pub fn create_escrow(ctx: Context<CreateEscrow>) -> Result<()> {
        // Record bump so we can sign with PDA later
        let bump = ctx.bumps.escrow_authority;
        ctx.accounts.invoice.escrow_bump = bump;
        Ok(())
    }

    pub fn fund_invoice(ctx: Context<FundInvoice>, amount: u64) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        require!(invoice.status == InvoiceStatus::Open || invoice.status == InvoiceStatus::Funded, InvoiceError::WrongStatus);
        require!(ctx.accounts.investor_ata.mint == invoice.usdc_mint, InvoiceError::MintMismatch);
        require!(ctx.accounts.escrow_token.mint == invoice.usdc_mint, InvoiceError::MintMismatch);

        let cpi_accounts = Transfer {
            from: ctx.accounts.investor_ata.to_account_info(),
            to: ctx.accounts.escrow_token.to_account_info(),
            authority: ctx.accounts.investor.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        invoice.funded_amount = invoice.funded_amount.saturating_add(amount);
        invoice.status = InvoiceStatus::Funded;
        invoice.investor = ctx.accounts.investor.key();
        Ok(())
    }

    pub fn set_settled(ctx: Context<SetSettled>, amount: u64) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        require!(ctx.accounts.seller_ata.mint == invoice.usdc_mint, InvoiceError::MintMismatch);
        require!(ctx.accounts.escrow_token.mint == invoice.usdc_mint, InvoiceError::MintMismatch);

        let bump = invoice.escrow_bump;
        let invoice_key = invoice.key();
        let signer_seeds: &[&[u8]] = &[b"escrow", invoice_key.as_ref(), &[bump]];
        let signer: &[&[&[u8]]] = &[signer_seeds];

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_token.to_account_info(),
            to: ctx.accounts.seller_ata.to_account_info(),
            authority: ctx.accounts.escrow_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token::transfer(cpi_ctx, amount)?;

        invoice.status = InvoiceStatus::Settled;
        Ok(())
    }

    pub fn init_shares(ctx: Context<InitShares>) -> Result<()> {
        // Initialize per-invoice shares mint; authority is escrow PDA
        ctx.accounts.invoice.shares_mint = ctx.accounts.shares_mint.key();
        Ok(())
    }

    pub fn fund_invoice_fractional(ctx: Context<FundInvoiceFractional>, amount: u64) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        require!(invoice.status == InvoiceStatus::Open || invoice.status == InvoiceStatus::Funded, InvoiceError::WrongStatus);
        require!(invoice.escrow_bump != 0, InvoiceError::BumpNotFound);
        require!(ctx.accounts.investor_ata.mint == invoice.usdc_mint, InvoiceError::MintMismatch);
        require!(ctx.accounts.escrow_token.mint == invoice.usdc_mint, InvoiceError::MintMismatch);
        // shares mint must be set and match
        require!(ctx.accounts.shares_mint.key() == invoice.shares_mint, InvoiceError::SharesMintMissing);

        // Transfer USDC from investor to escrow
        let cpi_accounts = Transfer {
            from: ctx.accounts.investor_ata.to_account_info(),
            to: ctx.accounts.escrow_token.to_account_info(),
            authority: ctx.accounts.investor.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Mint fractional shares to investor using escrow PDA as authority
        let bump = invoice.escrow_bump;
        let invoice_key = invoice.key();
        let signer_seeds: &[&[u8]] = &[b"escrow", invoice_key.as_ref(), &[bump]];
        let signer: &[&[&[u8]]] = &[signer_seeds];
        let mint_accounts = MintTo {
            mint: ctx.accounts.shares_mint.to_account_info(),
            to: ctx.accounts.investor_shares_ata.to_account_info(),
            authority: ctx.accounts.escrow_authority.to_account_info(),
        };
        let mint_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            mint_accounts,
            signer,
        );
        token::mint_to(mint_ctx, amount)?;

        invoice.funded_amount = invoice.funded_amount.saturating_add(amount);
        invoice.status = InvoiceStatus::Funded;
        invoice.investor = ctx.accounts.investor.key();
        Ok(())
    }
}

#[derive(Accounts)]
pub struct MintInvoice<'info> {
    #[account(
        init,
        payer = seller,
        space = 8  // discriminator
            + 32   // seller
            + 8    // amount
            + 4 + METADATA_MAX_LEN // metadata_hash
            + 8    // due_date
            + 1    // status
            + 32   // investor
            + 8    // funded_amount
            + 32   // usdc_mint
            + 1    // escrow_bump
            + 32   // shares_mint
    )]
    pub invoice: Account<'info, Invoice>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub usdc_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitShares<'info> {
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    /// Payer to create the shares mint
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: PDA authority, no data allocation required
    #[account(seeds = [b"escrow", invoice.key().as_ref()], bump)]
    pub escrow_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = escrow_authority,
    )]
    pub shares_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateEscrow<'info> {
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    /// Payer for creating the escrow token account (seller for PoC)
    #[account(mut)]
    pub seller: Signer<'info>,
    pub usdc_mint: Account<'info, Mint>,
    /// CHECK: PDA authority, no data allocation required
    #[account(seeds = [b"escrow", invoice.key().as_ref()], bump)]
    pub escrow_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = seller,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_authority,
    )]
    pub escrow_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundInvoice<'info> {
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    pub investor: Signer<'info>,
    #[account(
        mut,
        constraint = investor_ata.owner == investor.key(),
        constraint = investor_ata.mint == invoice.usdc_mint,
    )]
    pub investor_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = escrow_token.mint == invoice.usdc_mint,
        constraint = escrow_token.owner == escrow_authority.key(),
    )]
    pub escrow_token: Account<'info, TokenAccount>,
    /// CHECK: PDA authority for escrow
    #[account(seeds = [b"escrow", invoice.key().as_ref()], bump = invoice.escrow_bump)]
    pub escrow_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct FundInvoiceFractional<'info> {
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    #[account(mut)]
    pub investor: Signer<'info>,
    #[account(
        mut,
        constraint = investor_ata.owner == investor.key(),
        constraint = investor_ata.mint == invoice.usdc_mint,
    )]
    pub investor_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = escrow_token.mint == invoice.usdc_mint,
        constraint = escrow_token.owner == escrow_authority.key(),
    )]
    pub escrow_token: Account<'info, TokenAccount>,
    /// CHECK: PDA authority for escrow and shares mint
    #[account(seeds = [b"escrow", invoice.key().as_ref()], bump = invoice.escrow_bump)]
    pub escrow_authority: UncheckedAccount<'info>,
    /// Shares mint must match invoice.shares_mint
    #[account(mut)]
    pub shares_mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = investor,
        associated_token::mint = shares_mint,
        associated_token::authority = investor,
    )]
    pub investor_shares_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetSettled<'info> {
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    pub operator: Signer<'info>, // later: require multisig / verified relayer
    #[account(
        mut,
        constraint = seller_ata.owner == invoice.seller,
        constraint = seller_ata.mint == invoice.usdc_mint,
    )]
    pub seller_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = escrow_token.mint == invoice.usdc_mint,
        constraint = escrow_token.owner == escrow_authority.key(),
    )]
    pub escrow_token: Account<'info, TokenAccount>,
    /// CHECK: PDA authority for escrow
    #[account(seeds = [b"escrow", invoice.key().as_ref()], bump = invoice.escrow_bump)]
    pub escrow_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Invoice {
    pub seller: Pubkey,
    pub amount: u64,
    pub metadata_hash: String,
    pub due_date: i64,
    pub status: InvoiceStatus,
    pub investor: Pubkey,
    pub funded_amount: u64,
    pub usdc_mint: Pubkey,
    pub escrow_bump: u8,
    pub shares_mint: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum InvoiceStatus {
    Open,
    Funded,
    Settled,
}

#[error_code]
pub enum InvoiceError {
    #[msg("Invalid state for this action")] WrongStatus,
    #[msg("Bump not found")] BumpNotFound,
    #[msg("Mint mismatch")] MintMismatch,
    #[msg("Shares mint missing or mismatched")] SharesMintMissing,
}
