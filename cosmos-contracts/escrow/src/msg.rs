use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Uint128;

use crate::state::Escrow;

#[cw_serde]
pub struct InstantiateMsg {
    pub owner: String,
}

#[cw_serde]
pub enum ExecuteMsg {
    CreateEscrow { escrow: Escrow },
    Claim { order_hash: String, preimage: String },
    Refund { order_hash: String },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(Escrow)]
    GetEscrow { order_hash: String },
    #[returns(Vec<Escrow>)]
    ListEscrows { start_after: Option<String>, limit: Option<u32> },
}

#[cw_serde]
pub struct MigrateMsg {} 