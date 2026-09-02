package keeper_test

import (
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"

	"github.com/giltchain/gilt-consensus/x/stake/types"
)

func (s *KeeperTestSuite) TestWave6NativeApproveValidatorCannotWritePower() {
	ctx, msgServer, keeper, require := s.ctx, s.msgServer, s.stakeKeeper, s.Require()
	validators := s.seedNativeValidators(4)
	operator := secp256k1.GenPrivKey().PubKey().Address().String()
	joinPubKey := secp256k1.GenPrivKey().PubKey()

	before, err := keeper.GetValidatorFromValID(ctx, validators[0].ValId)
	require.NoError(err)
	beforePower := before.VotingPower

	approveMsg, err := types.NewMsgApproveValidator(validators[0].OperatorAddress(), 5, operator, 1, oneGilt, joinPubKey, 1)
	require.NoError(err)
	_, err = msgServer.ApproveValidator(ctx, approveMsg)
	require.Error(err)
	require.Contains(err.Error(), "native validator GILT stake writes are retired")

	after, err := keeper.GetValidatorFromValID(ctx, validators[0].ValId)
	require.NoError(err)
	require.Equal(beforePower, after.VotingPower)
}

func (s *KeeperTestSuite) TestWave6KeeperApproveValidatorCannotWritePower() {
	ctx, keeper, require := s.ctx, s.stakeKeeper, s.Require()
	validators := s.seedNativeValidators(4)
	operator := secp256k1.GenPrivKey().PubKey().Address().String()
	joinPubKey := secp256k1.GenPrivKey().PubKey()

	before, err := keeper.GetValidatorFromValID(ctx, validators[0].ValId)
	require.NoError(err)
	beforePower := before.VotingPower

	approveMsg, err := types.NewMsgApproveValidator(validators[0].OperatorAddress(), 5, operator, 1, oneGilt, joinPubKey, 1)
	require.NoError(err)
	err = keeper.ApproveValidator(ctx, approveMsg)
	require.Error(err)
	require.Contains(err.Error(), "native validator GILT stake writes are retired")

	after, err := keeper.GetValidatorFromValID(ctx, validators[0].ValId)
	require.NoError(err)
	require.Equal(beforePower, after.VotingPower)
}
