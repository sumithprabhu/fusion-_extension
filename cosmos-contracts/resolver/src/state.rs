use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::Map;

#[cw_serde]
pub struct Order {
    pub order_hash: String,
    pub maker: String,
    pub taker: String,
    pub token: String,
    pub amount: Uint128,
    pub hashlock: Vec<u8>,
    pub timelock: u64,
}

pub const ORDERS: Map<&str, Order> = Map::new("orders");
pub const RESOLVER_ADDRESS: Map<&str, String> = Map::new("resolver_address");
pub const RESOLVER: Map<&str, String> = Map::new("resolver"); 