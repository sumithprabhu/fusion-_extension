use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("Invalid amount")]
    InvalidAmount {},

    #[error("Invalid timelock")]
    InvalidTimelock {},

    #[error("Timelock expired")]
    TimelockExpired {},

    #[error("Timelock not expired")]
    TimelockNotExpired {},

    #[error("Invalid preimage")]
    InvalidPreimage {},

    #[error("Escrow not active")]
    EscrowNotActive {},

    #[error("Escrow already exists")]
    EscrowAlreadyExists {},

    #[error("Escrow not found")]
    EscrowNotFound {},
} 