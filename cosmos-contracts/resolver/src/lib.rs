use cosmwasm_std::entry_point;
use cosmwasm_std::{Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult, to_json_binary};
use cw2::set_contract_version;

pub mod error;
pub mod msg;
pub mod state;

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::state::{Order, ORDERS, RESOLVER_ADDRESS};

// version info for migration info
const CONTRACT_NAME: &str = "crates.io:cosmos-resolver";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    
    // Set the resolver address
    RESOLVER_ADDRESS.save(deps.storage, "resolver", &msg.resolver_address)?;
    
    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("resolver", msg.resolver_address))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::DeploySrcEscrow { order } => execute_deploy_src_escrow(deps, env, info, order),
        ExecuteMsg::DeployDstEscrow { order } => execute_deploy_dst_escrow(deps, env, info, order),
        ExecuteMsg::Withdraw { side, escrow_address, secret, immutables } => {
            execute_withdraw(deps, env, info, side, escrow_address, secret, immutables)
        },
        ExecuteMsg::Cancel { side, escrow_address, immutables } => {
            execute_cancel(deps, env, info, side, escrow_address, immutables)
        },
        ExecuteMsg::UpdateOwnership(_action) => {
            // For now, just return success - implement proper ownership handling later
            Ok(Response::new().add_attribute("method", "update_ownership"))
        },
    }
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetOrder { order_hash } => to_json_binary(&query_order(deps, order_hash)?),
        QueryMsg::Ownership {} => to_json_binary(&"owner".to_string()),
    }
}

pub fn execute_deploy_src_escrow(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    order: Order,
) -> Result<Response, ContractError> {
    // Verify the caller is the resolver
    let resolver = RESOLVER_ADDRESS.load(deps.storage, "resolver")?;
    if info.sender != resolver {
        return Err(ContractError::Unauthorized {});
    }
    
    // Store the order
    ORDERS.save(deps.storage, &order.order_hash, &order)?;
    
    Ok(Response::new()
        .add_attribute("method", "deploy_src_escrow")
        .add_attribute("order_hash", order.order_hash)
        .add_attribute("maker", order.maker)
        .add_attribute("taker", order.taker))
}

pub fn execute_deploy_dst_escrow(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    order: Order,
) -> Result<Response, ContractError> {
    // Verify the caller is the resolver
    let resolver = RESOLVER_ADDRESS.load(deps.storage, "resolver")?;
    if info.sender != resolver {
        return Err(ContractError::Unauthorized {});
    }
    
    // Store the order
    ORDERS.save(deps.storage, &order.order_hash, &order)?;
    
    Ok(Response::new()
        .add_attribute("method", "deploy_dst_escrow")
        .add_attribute("order_hash", order.order_hash)
        .add_attribute("maker", order.maker)
        .add_attribute("taker", order.taker))
}

pub fn execute_withdraw(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    side: String,
    escrow_address: String,
    secret: String,
    immutables: String,
) -> Result<Response, ContractError> {
    // Verify the caller is the resolver
    let resolver = RESOLVER_ADDRESS.load(deps.storage, "resolver")?;
    if info.sender != resolver {
        return Err(ContractError::Unauthorized {});
    }
    
    // In a real implementation, you would interact with the escrow contract
    // For now, we just log the withdrawal
    Ok(Response::new()
        .add_attribute("method", "withdraw")
        .add_attribute("side", side)
        .add_attribute("escrow", escrow_address)
        .add_attribute("secret", secret))
}

pub fn execute_cancel(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    side: String,
    escrow_address: String,
    immutables: String,
) -> Result<Response, ContractError> {
    // Verify the caller is the resolver
    let resolver = RESOLVER_ADDRESS.load(deps.storage, "resolver")?;
    if info.sender != resolver {
        return Err(ContractError::Unauthorized {});
    }
    
    // In a real implementation, you would interact with the escrow contract
    // For now, we just log the cancellation
    Ok(Response::new()
        .add_attribute("method", "cancel")
        .add_attribute("side", side)
        .add_attribute("escrow", escrow_address))
}

pub fn query_order(deps: Deps, order_hash: String) -> StdResult<Order> {
    ORDERS.load(deps.storage, &order_hash)
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{coins, from_binary};

    #[test]
    fn test_deploy_src_escrow() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let info = mock_info("resolver", &coins(1000, "ujuno"));
        
        let order = Order {
            order_hash: "test_hash".to_string(),
            maker: "maker".to_string(),
            taker: "taker".to_string(),
            token: "ujuno".to_string(),
            amount: cosmwasm_std::Uint128::new(1000),
            hashlock: vec![1, 2, 3, 4],
            timelock: env.block.time.seconds() + 3600,
        };
        
        // Set resolver address
        RESOLVER_ADDRESS.save(deps.as_mut().storage, &"resolver".to_string()).unwrap();
        
        let msg = ExecuteMsg::DeploySrcEscrow { order };
        let res = execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.attributes.len(), 4);
    }
} 