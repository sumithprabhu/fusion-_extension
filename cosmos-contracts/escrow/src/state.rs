use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::Map;

#[cw_serde]
pub struct Escrow {
    pub order_hash: String,
    pub maker: String,
    pub taker: String,
    pub token: String,
    pub amount: Uint128,
    pub hashlock: Vec<u8>,
    pub timelock: u64,
    pub is_active: bool,
    pub is_claimed: bool,
    pub is_refunded: bool,
}

pub const ESCROWS: Map<&str, Escrow> = Map::new("escrows"); 