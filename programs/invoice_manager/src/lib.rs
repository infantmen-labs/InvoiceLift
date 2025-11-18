use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, TransferChecked, MintTo, Revoke};
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

// Events
#[event]
pub struct ListingFulfilledV1 {
    pub invoice: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub qty: u64,
    pub total: u64,
}

#[event]
pub struct ListingFulfilledV2 {
    pub invoice: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub qty: u64,
    pub total: u64,
}

#[event]
pub struct ListingCanceledV1 {
    pub invoice: Pubkey,
    pub seller: Pubkey,
    pub qty: u64,
}

#[event]
pub struct ListingCanceledV2 {
    pub invoice: Pubkey,
    pub seller: Pubkey,
    pub qty: u64,
}

#[derive(Accounts)]
pub struct CancelListingV2<'info> {
    pub invoice: Account<'info, Invoice>,
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        mut,
        seeds = [b"listing", invoice.key().as_ref(), seller.key().as_ref()],
        bump = listing.bump,
        constraint = listing.seller == seller.key(),
    )]
    pub listing: Account<'info, Listing>,
    /// CHECK: PDA authority used as delegate in V2
    #[account(seeds = [b"market", listing.key().as_ref()], bump = listing.market_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = seller_shares_ata.owner == seller.key(),
        constraint = seller_shares_ata.mint == listing.shares_mint,
    )]
    pub seller_shares_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

 

#[derive(Accounts)]
pub struct CreateListingV2<'info> {
    /// Invoice for which the listing is created
    pub invoice: Account<'info, Invoice>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub shares_mint: Account<'info, Mint>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = seller,
        seeds = [b"listing", invoice.key().as_ref(), seller.key().as_ref()],
        bump,
        space = 8  // disc
            + 32  // invoice
            + 32  // seller
            + 32  // shares_mint
            + 32  // usdc_mint
            + 8   // price
            + 8   // remaining_qty
            + 1   // bump
            + 1   // market_bump
    )]
    pub listing: Account<'info, Listing>,
    /// CHECK: PDA authority used as delegate for allowance-based flow
    #[account(seeds = [b"market", listing.key().as_ref()], bump)]
    pub market_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
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
        require!(invoice.funded_amount.saturating_add(amount) <= invoice.amount, InvoiceError::Overfund);

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
        require!(amount > 0, InvoiceError::InvalidParameter);
        require!(invoice.status == InvoiceStatus::Funded, InvoiceError::WrongStatus);
        require!(invoice.funded_amount == amount, InvoiceError::Overfund);
        require_keys_eq!(ctx.accounts.operator.key(), ctx.accounts.config.admin, InvoiceError::Unauthorized);
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
        require!(invoice.funded_amount.saturating_add(amount) <= invoice.amount, InvoiceError::Overfund);

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

    // Marketplace V1 (escrow-based shares, atomic fulfill):
    // - create_listing: seller deposits shares to a marketplace escrow ATA owned by a PDA
    // - fulfill_listing: buyer pays USDC to seller; program releases shares to buyer from escrow (atomic)
    // - cancel_listing: seller retrieves remaining shares from escrow

    pub fn create_listing(ctx: Context<CreateListing>, qty: u64, price: u64) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(ctx.accounts.shares_mint.key() == invoice.shares_mint, InvoiceError::SharesMintMissing);
        require!(ctx.accounts.usdc_mint.key() == invoice.usdc_mint, InvoiceError::MintMismatch);
        require!(qty > 0 && price > 0, InvoiceError::InvalidParameter);

        // Transfer shares from seller to escrow
        let cpi_accounts = Transfer {
            from: ctx.accounts.seller_shares_ata.to_account_info(),
            to: ctx.accounts.escrow_shares_ata.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, qty)?;

        let listing = &mut ctx.accounts.listing;
        listing.invoice = invoice.key();
        listing.seller = ctx.accounts.seller.key();
        listing.shares_mint = ctx.accounts.shares_mint.key();
        listing.usdc_mint = ctx.accounts.usdc_mint.key();
        listing.price = price;
        listing.remaining_qty = qty;
        listing.bump = ctx.bumps.listing;
        listing.market_bump = ctx.bumps.market_authority;
        Ok(())
    }

    pub fn create_listing_v2(ctx: Context<CreateListingV2>, qty: u64, price: u64) -> Result<()> {
        let invoice = &ctx.accounts.invoice;
        require!(ctx.accounts.shares_mint.key() == invoice.shares_mint, InvoiceError::SharesMintMissing);
        require!(ctx.accounts.usdc_mint.key() == invoice.usdc_mint, InvoiceError::MintMismatch);
        require!(qty > 0 && price > 0, InvoiceError::InvalidParameter);

        let listing = &mut ctx.accounts.listing;
        listing.invoice = invoice.key();
        listing.seller = ctx.accounts.seller.key();
        listing.shares_mint = ctx.accounts.shares_mint.key();
        listing.usdc_mint = ctx.accounts.usdc_mint.key();
        listing.price = price;
        listing.remaining_qty = qty;
        listing.bump = ctx.bumps.listing;
        listing.market_bump = ctx.bumps.market_authority;
        Ok(())
    }

    pub fn fulfill_listing(ctx: Context<FulfillListing>, qty: u64) -> Result<()> {
        let listing_key = ctx.accounts.listing.key();
        let market_bump = ctx.accounts.listing.market_bump;
        let listing = &mut ctx.accounts.listing;
        let invoice = &ctx.accounts.invoice;
        require!(listing.invoice == invoice.key(), InvoiceError::ListingMismatch);
        require!(listing.shares_mint == invoice.shares_mint, InvoiceError::SharesMintMissing);
        require!(listing.usdc_mint == invoice.usdc_mint, InvoiceError::MintMismatch);
        require!(qty > 0 && qty <= listing.remaining_qty, InvoiceError::InsufficientEscrow);
        // qty has 6 decimals (shares), price has 6 decimals (USDC/share) -> total needs 6 decimals (USDC)
        let total_raw = qty.checked_mul(listing.price).ok_or(InvoiceError::MathOverflow)?;
        let total = total_raw
            .checked_div(1_000_000)
            .ok_or(InvoiceError::MathOverflow)?;

        // Transfer USDC from buyer to seller
        let usdc_transfer = Transfer {
            from: ctx.accounts.buyer_usdc_ata.to_account_info(),
            to: ctx.accounts.seller_usdc_ata.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        let usdc_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), usdc_transfer);
        token::transfer(usdc_ctx, total)?;

        // Transfer shares from escrow to buyer using market authority PDA signer
        let seeds: &[&[u8]] = &[b"market", listing_key.as_ref(), &[market_bump]];
        let signer: &[&[&[u8]]] = &[seeds];
        let share_transfer = Transfer {
            from: ctx.accounts.escrow_shares_ata.to_account_info(),
            to: ctx.accounts.buyer_shares_ata.to_account_info(),
            authority: ctx.accounts.market_authority.to_account_info(),
        };
        let share_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            share_transfer,
            signer,
        );
        token::transfer(share_ctx, qty)?;

        listing.remaining_qty = listing.remaining_qty.saturating_sub(qty);
        // Emit event
        emit!(ListingFulfilledV1 {
            invoice: invoice.key(),
            seller: listing.seller,
            buyer: ctx.accounts.buyer.key(),
            qty,
            total,
        });
        Ok(())
    }

    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        let listing_key = ctx.accounts.listing.key();
        let market_bump = ctx.accounts.listing.market_bump;
        let remaining = ctx.accounts.listing.remaining_qty;
        if remaining > 0 {
            let seeds: &[&[u8]] = &[b"market", listing_key.as_ref(), &[market_bump]];
            let signer: &[&[&[u8]]] = &[seeds];
            let share_transfer = Transfer {
                from: ctx.accounts.escrow_shares_ata.to_account_info(),
                to: ctx.accounts.seller_shares_ata.to_account_info(),
                authority: ctx.accounts.market_authority.to_account_info(),
            };
            let share_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                share_transfer,
                signer,
            );
            token::transfer(share_ctx, remaining)?;
            ctx.accounts.listing.remaining_qty = 0;
        }
        // Emit event for V1 cancel
        emit!(ListingCanceledV1 {
            invoice: ctx.accounts.invoice.key(),
            seller: ctx.accounts.listing.seller,
            qty: remaining,
        });
        Ok(())
    }

    // Marketplace V2 (allowance-based, no escrow):
    // - Seller approves shares to marketplace_authority (delegate)
    // - Buyer approves USDC to marketplace_authority (delegate)
    // - Program atomically swaps via transfer_checked using PDA signer as delegate
    pub fn fulfill_listing_v2(ctx: Context<FulfillListingV2>, qty: u64) -> Result<()> {
        let listing_key = ctx.accounts.listing.key();
        let market_bump = ctx.accounts.listing.market_bump;
        let listing = &mut ctx.accounts.listing;
        let invoice = &ctx.accounts.invoice;

        require!(listing.invoice == invoice.key(), InvoiceError::ListingMismatch);
        require!(listing.shares_mint == invoice.shares_mint, InvoiceError::SharesMintMissing);
        require!(listing.usdc_mint == invoice.usdc_mint, InvoiceError::MintMismatch);
        require!(qty > 0 && qty <= listing.remaining_qty, InvoiceError::InsufficientEscrow);

        // qty has 6 decimals (shares), price has 6 decimals (USDC/share) -> total needs 6 decimals (USDC)
        let total_raw = qty.checked_mul(listing.price).ok_or(InvoiceError::MathOverflow)?;
        let total = total_raw.checked_div(1_000_000).ok_or(InvoiceError::MathOverflow)?;

        // Delegation checks: both ATAs must delegate to market authority and have sufficient allowances
        use anchor_lang::solana_program::program_option::COption;
        require!(
            ctx.accounts.seller_shares_ata.delegate == COption::Some(ctx.accounts.market_authority.key()),
            InvoiceError::DelegateMissing
        );
        require!(
            ctx.accounts.buyer_usdc_ata.delegate == COption::Some(ctx.accounts.market_authority.key()),
            InvoiceError::DelegateMissing
        );
        require!(ctx.accounts.seller_shares_ata.delegated_amount >= qty, InvoiceError::InsufficientAllowance);
        require!(ctx.accounts.buyer_usdc_ata.delegated_amount >= total, InvoiceError::InsufficientAllowance);

        // PDA signer seeds
        let seeds: &[&[u8]] = &[b"market", listing_key.as_ref(), &[market_bump]];
        let signer: &[&[&[u8]]] = &[seeds];

        // Transfer USDC from buyer to seller using PDA as delegate authority
        let usdc_transfer = TransferChecked {
            from: ctx.accounts.buyer_usdc_ata.to_account_info(),
            to: ctx.accounts.seller_usdc_ata.to_account_info(),
            authority: ctx.accounts.market_authority.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
        };
        let usdc_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            usdc_transfer,
            signer,
        );
        token::transfer_checked(usdc_ctx, total, ctx.accounts.usdc_mint.decimals)?;

        // Transfer shares from seller to buyer using PDA as delegate authority
        let share_transfer = TransferChecked {
            from: ctx.accounts.seller_shares_ata.to_account_info(),
            to: ctx.accounts.buyer_shares_ata.to_account_info(),
            authority: ctx.accounts.market_authority.to_account_info(),
            mint: ctx.accounts.shares_mint.to_account_info(),
        };
        let share_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            share_transfer,
            signer,
        );
        token::transfer_checked(share_ctx, qty, ctx.accounts.shares_mint.decimals)?;

        // Update remaining planned quantity on listing
        listing.remaining_qty = listing.remaining_qty.saturating_sub(qty);
        // Emit event
        emit!(ListingFulfilledV2 {
            invoice: invoice.key(),
            seller: listing.seller,
            buyer: ctx.accounts.buyer.key(),
            qty,
            total,
        });
        Ok(())
    }

    pub fn cancel_listing_v2(ctx: Context<CancelListingV2>) -> Result<()> {
        // Ensure listing matches invoice and signer is seller
        let invoice = &ctx.accounts.invoice;
        let listing = &mut ctx.accounts.listing;
        require!(listing.invoice == invoice.key(), InvoiceError::ListingMismatch);
        require!(listing.seller == ctx.accounts.seller.key(), InvoiceError::ListingMismatch);

        // If seller shares ATA delegated to market_authority, revoke it
        use anchor_lang::solana_program::program_option::COption;
        if ctx.accounts.seller_shares_ata.delegate == COption::Some(ctx.accounts.market_authority.key()) {
            let revoke_accounts = Revoke {
                source: ctx.accounts.seller_shares_ata.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            };
            let revoke_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), revoke_accounts);
            token::revoke(revoke_ctx)?;
        }

        // Set remaining qty to 0 to reflect cancellation on-chain
        let canceled = listing.remaining_qty;
        listing.remaining_qty = 0;
        // Emit event
        emit!(ListingCanceledV2 {
            invoice: invoice.key(),
            seller: listing.seller,
            qty: canceled,
        });
        Ok(())
    }
    pub fn init_config(ctx: Context<InitConfig>, admin: Pubkey) -> Result<()> {
        ctx.accounts.config.admin = admin;
        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, new_admin: Pubkey) -> Result<()> {
        require_keys_eq!(ctx.accounts.admin.key(), ctx.accounts.config.admin, InvoiceError::Unauthorized);
        ctx.accounts.config.admin = new_admin;
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
pub struct InitConfig<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, AdminConfig>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [b"config"], bump)]
    pub config: Account<'info, AdminConfig>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct FulfillListingV2<'info> {
    pub invoice: Account<'info, Invoice>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"listing", invoice.key().as_ref(), listing.seller.as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, Listing>,
    /// CHECK: PDA authority used as delegate
    #[account(seeds = [b"market", listing.key().as_ref()], bump = listing.market_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = buyer_usdc_ata.owner == buyer.key(),
        constraint = buyer_usdc_ata.mint == listing.usdc_mint,
    )]
    pub buyer_usdc_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = seller_usdc_ata.owner == listing.seller,
        constraint = seller_usdc_ata.mint == listing.usdc_mint,
    )]
    pub seller_usdc_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = seller_shares_ata.owner == listing.seller,
        constraint = seller_shares_ata.mint == listing.shares_mint,
    )]
    pub seller_shares_ata: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = shares_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_shares_ata: Account<'info, TokenAccount>,
    pub shares_mint: Account<'info, Mint>,
    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
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
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, AdminConfig>,
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

#[derive(Accounts)]
pub struct CreateListing<'info> {
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub shares_mint: Account<'info, Mint>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = seller,
        seeds = [b"listing", invoice.key().as_ref(), seller.key().as_ref()],
        bump,
        space = 8  // disc
            + 32  // invoice
            + 32  // seller
            + 32  // shares_mint
            + 32  // usdc_mint
            + 8   // price
            + 8   // remaining_qty
            + 1   // bump
            + 1   // market_bump
    )]
    pub listing: Account<'info, Listing>,
    /// CHECK: PDA authority over escrow ATAs
    #[account(seeds = [b"market", listing.key().as_ref()], bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = seller_shares_ata.owner == seller.key(),
        constraint = seller_shares_ata.mint == shares_mint.key(),
    )]
    pub seller_shares_ata: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = seller,
        associated_token::mint = shares_mint,
        associated_token::authority = market_authority,
    )]
    pub escrow_shares_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FulfillListing<'info> {
    pub invoice: Account<'info, Invoice>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"listing", invoice.key().as_ref(), listing.seller.as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, Listing>,
    /// CHECK: PDA authority
    #[account(seeds = [b"market", listing.key().as_ref()], bump = listing.market_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = buyer_usdc_ata.owner == buyer.key(),
        constraint = buyer_usdc_ata.mint == listing.usdc_mint,
    )]
    pub buyer_usdc_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = seller_usdc_ata.owner == listing.seller,
        constraint = seller_usdc_ata.mint == listing.usdc_mint,
    )]
    pub seller_usdc_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = escrow_shares_ata.mint == listing.shares_mint,
        constraint = escrow_shares_ata.owner == market_authority.key(),
    )]
    pub escrow_shares_ata: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = shares_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_shares_ata: Account<'info, TokenAccount>,
    pub shares_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    pub invoice: Account<'info, Invoice>,
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        mut,
        seeds = [b"listing", invoice.key().as_ref(), seller.key().as_ref()],
        bump = listing.bump,
        constraint = listing.seller == seller.key(),
    )]
    pub listing: Account<'info, Listing>,
    /// CHECK: PDA authority
    #[account(seeds = [b"market", listing.key().as_ref()], bump = listing.market_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = escrow_shares_ata.mint == listing.shares_mint,
        constraint = escrow_shares_ata.owner == market_authority.key(),
    )]
    pub escrow_shares_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = seller_shares_ata.owner == seller.key(),
        constraint = seller_shares_ata.mint == listing.shares_mint,
    )]
    pub seller_shares_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct AdminConfig {
    pub admin: Pubkey,
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

#[account]
pub struct Listing {
    pub invoice: Pubkey,
    pub seller: Pubkey,
    pub shares_mint: Pubkey,
    pub usdc_mint: Pubkey,
    pub price: u64,
    pub remaining_qty: u64,
    pub bump: u8,
    pub market_bump: u8,
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
    #[msg("Math overflow")] MathOverflow,
    #[msg("Listing does not match invoice")] ListingMismatch,
    #[msg("Insufficient escrowed shares")] InsufficientEscrow,
    #[msg("Funding amount exceeds invoice total")] Overfund,
    #[msg("Required delegate missing")] DelegateMissing,
    #[msg("Insufficient delegated allowance")] InsufficientAllowance,
    #[msg("Invalid parameter provided")] InvalidParameter,
    #[msg("Unauthorized")] Unauthorized,
}
