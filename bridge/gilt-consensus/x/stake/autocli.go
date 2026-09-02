package stake

import (
	autocliv1 "cosmossdk.io/api/cosmos/autocli/v1"
	_ "cosmossdk.io/api/cosmos/crypto/secp256k1" // register so that it shows up in protoregistry.GlobalTypes
	_ "cosmossdk.io/api/cosmos/crypto/secp256r1" // register so that it shows up in protoregistry.GlobalTypes

	"github.com/giltchain/gilt-consensus/api/giltconsensusv2/stake"
)

// AutoCLIOptions returns the auto cli options for the module (query and tx)
func (am AppModule) AutoCLIOptions() *autocliv1.ModuleOptions {
	return &autocliv1.ModuleOptions{
		Query: &autocliv1.ServiceCommandDescriptor{
			Service: stake.Query_ServiceDesc.ServiceName,
			RpcCommandOptions: []*autocliv1.RpcCommandOptions{
				{
					RpcMethod:      "GetCurrentValidatorSet",
					Use:            "current-validator-set",
					Short:          "Query all validators which are currently active in validator set",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{},
				},
				{
					RpcMethod:      "GetSignerByAddress",
					Use:            "signer [val_address]",
					Short:          "Query validator info for given validator address",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "val_address"}},
				},
				{
					RpcMethod:      "GetValidatorById",
					Use:            "validator [id]",
					Short:          "Query validator info for a given validator id",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "id"}},
				},
				{
					RpcMethod: "GetValidatorStatusByAddress",
					Use:       "validator-status [val_address]",
					Short:     "Query validator status for given validator address",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{
						{ProtoField: "val_address"},
					},
				},
				{
					RpcMethod:      "GetTotalPower",
					Use:            "total-power",
					Short:          "Query total power of the validator set",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{},
				},
				{
					RpcMethod:      "GetCurrentProposer",
					Use:            "get-current-proposer",
					Short:          "Get the current proposer",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{},
				},
			},
		},
		Tx: &autocliv1.ServiceCommandDescriptor{
			Service:              stake.Msg_ServiceDesc.ServiceName,
			EnhanceCustomCommand: true,
			RpcCommandOptions: []*autocliv1.RpcCommandOptions{
				{
					RpcMethod: "ApproveValidator",
					Use:       "approve-validator [from] [valId] [operator] [activationEpoch] [maxGiltStake] [signerPubKey] [nonce]",
					Short:     "Approve a native Gold Chain validator candidate",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{
						{ProtoField: "from"},
						{ProtoField: "val_id"},
						{ProtoField: "operator"},
						{ProtoField: "activation_epoch"},
						{ProtoField: "max_gilt_stake"},
						{ProtoField: "signer_pub_key"},
						{ProtoField: "nonce"},
					},
				},
				{
					RpcMethod: "WithdrawValidatorStake",
					Use:       "withdraw-validator-stake [from] [valId]",
					Short:     "Withdraw self-staked GILT after validator exit unbonding",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{
						{ProtoField: "from"},
						{ProtoField: "val_id"},
					},
				},
			},
		},
	}
}
