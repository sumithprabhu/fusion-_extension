use cosmwasm_std::entry_point;
use cosmwasm_std::{Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult, to_json_binary, Order};
use cw2::set_contract_version;
use cw_storage_plus::Bound;
use sha2::{Sha256, Digest};

pub mod error;
pub mod msg;
pub mod state;

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::state::{Escrow, ESCROWS};

// version info for migration info
const CONTRACT_NAME: &str = "crates.io:cosmos-escrow";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    Ok(Response::new().add_attribute("method", "instantiate"))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateEscrow { escrow } => execute_create_escrow(deps, env, info, escrow),
        ExecuteMsg::Claim { order_hash, preimage } => execute_claim(deps, env, info, order_hash, preimage),
        ExecuteMsg::Refund { order_hash } => execute_refund(deps, env, info, order_hash),
    }
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetEscrow { order_hash } => to_json_binary(&query_escrow(deps, order_hash)?),
        QueryMsg::ListEscrows { start_after, limit } => to_json_binary(&query_list_escrows(deps, start_after, limit)?),
    }
}

pub fn execute_create_escrow(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    escrow: Escrow,
) -> Result<Response, ContractError> {
    // Validate escrow data
    if escrow.amount == cosmwasm_std::Uint128::zero() {
        return Err(ContractError::InvalidAmount {});
    }
    
    if escrow.timelock <= _env.block.time.seconds() {
        return Err(ContractError::InvalidTimelock {});
    }

    // Store the escrow
    ESCROWS.save(deps.storage, &escrow.order_hash, &escrow)?;

    Ok(Response::new()
        .add_attribute("method", "create_escrow")
        .add_attribute("order_hash", escrow.order_hash)
        .add_attribute("maker", escrow.maker)
        .add_attribute("taker", escrow.taker)
        .add_attribute("amount", escrow.amount.to_string()))
}

pub fn execute_claim(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    order_hash: String,
    preimage: String,
) -> Result<Response, ContractError> {
    let escrow = ESCROWS.load(deps.storage, &order_hash)?;
    
    // Verify the escrow is active
    if !escrow.is_active {
        return Err(ContractError::EscrowNotActive {});
    }
    
    // Verify timelock hasn't expired
    if _env.block.time.seconds() >= escrow.timelock {
        return Err(ContractError::TimelockExpired {});
    }
    
    // Verify the preimage matches the hashlock
    let expected_hash = Sha256::digest(preimage.as_bytes());
    if expected_hash[..] != escrow.hashlock {
        return Err(ContractError::InvalidPreimage {});
    }
    
    // Verify the claimer is the taker
    if info.sender != escrow.taker {
        return Err(ContractError::Unauthorized {});
    }
    
    // Mark escrow as claimed
    let mut updated_escrow = escrow.clone();
    updated_escrow.is_active = false;
    updated_escrow.is_claimed = true;
    ESCROWS.save(deps.storage, &order_hash, &updated_escrow)?;
    
    // Transfer funds to taker
    let transfer_msg = cosmwasm_std::BankMsg::Send {
        to_address: escrow.taker,
        amount: vec![cosmwasm_std::Coin {
            denom: escrow.token,
            amount: escrow.amount,
        }],
    };
    
    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("method", "claim")
        .add_attribute("order_hash", order_hash)
        .add_attribute("claimer", info.sender))
}

pub fn execute_refund(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    order_hash: String,
) -> Result<Response, ContractError> {
    let escrow = ESCROWS.load(deps.storage, &order_hash)?;
    
    // Verify the escrow is active
    if !escrow.is_active {
        return Err(ContractError::EscrowNotActive {});
    }
    
    // Verify timelock has expired
    if env.block.time.seconds() < escrow.timelock {
        return Err(ContractError::TimelockNotExpired {});
    }
    
    // Verify the refunder is the maker
    if info.sender != escrow.maker {
        return Err(ContractError::Unauthorized {});
    }
    
    // Mark escrow as refunded
    let mut updated_escrow = escrow.clone();
    updated_escrow.is_active = false;
    updated_escrow.is_refunded = true;
    ESCROWS.save(deps.storage, &order_hash, &updated_escrow)?;
    
    // Transfer funds back to maker
    let transfer_msg = cosmwasm_std::BankMsg::Send {
        to_address: escrow.maker,
        amount: vec![cosmwasm_std::Coin {
            denom: escrow.token,
            amount: escrow.amount,
        }],
    };
    
    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("method", "refund")
        .add_attribute("order_hash", order_hash)
        .add_attribute("refunder", info.sender))
}

pub fn query_escrow(deps: Deps, order_hash: String) -> StdResult<Escrow> {
    ESCROWS.load(deps.storage, &order_hash)
}

pub fn query_list_escrows(
    deps: Deps,
    start_after: Option<String>,
    limit: Option<u32>,
) -> StdResult<Vec<Escrow>> {
    let limit = limit.unwrap_or(30).min(100) as usize;
    
    let escrows: StdResult<Vec<_>> = if let Some(start_key) = start_after {
        ESCROWS
            .range(deps.storage, Some(Bound::exclusive(start_key.as_str())), None, Order::Ascending)
            .take(limit)
            .map(|item| item.map(|(_, escrow)| escrow))
            .collect()
    } else {
        ESCROWS
            .range(deps.storage, None, None, Order::Ascending)
            .take(limit)
            .map(|item| item.map(|(_, escrow)| escrow))
            .collect()
    };
    
    escrows
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{coins, from_binary};

    #[test]
    fn test_create_escrow() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let info = mock_info("creator", &coins(1000, "ujuno"));
        
        let escrow = Escrow {
            order_hash: "test_hash".to_string(),
            maker: "maker".to_string(),
            taker: "taker".to_string(),
            token: "ujuno".to_string(),
            amount: cosmwasm_std::Uint128::new(1000),
            hashlock: vec![1, 2, 3, 4],
            timelock: env.block.time.seconds() + 3600,
            is_active: true,
            is_claimed: false,
            is_refunded: false,
        };
        
        let msg = ExecuteMsg::CreateEscrow { escrow };
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.attributes.len(), 5);
    }
} 