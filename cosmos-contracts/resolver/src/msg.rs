use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Uint128;

use crate::state::Order;

#[cw_serde]
pub struct InstantiateMsg {
    pub resolver_address: String,
}

#[cw_serde]
pub enum ExecuteMsg {
    DeploySrcEscrow { order: Order },
    DeployDstEscrow { order: Order },
    Withdraw { side: String, escrow_address: String, secret: String, immutables: String },
    Cancel { side: String, escrow_address: String, immutables: String },
    UpdateOwnership(String),
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(Order)]
    GetOrder { order_hash: String },
    #[returns(String)]
    Ownership {},
}

#[cw_serde]
pub struct MigrateMsg {} 