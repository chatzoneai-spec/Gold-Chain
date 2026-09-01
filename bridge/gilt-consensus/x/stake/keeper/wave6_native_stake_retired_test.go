package keeper_test

import (
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	"github.com/golang/mock/gomock"
	"github.com/spf13/viper"

	"github.com/giltchain/gilt-consensus/helper"
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

func (s *KeeperTestSuite) TestWave6NativeJoinCannotIncreaseVotingPower() {
	ctx, msgServer, keeper, require := s.ctx, s.msgServer, s.stakeKeeper, s.Require()
	helper.SetRootAnchoredStakeReadEnabled(false)
	viper.Set(helper.BridgeFlag, true)

	validators := s.seedNativeValidators(4)
	beforeTotal := int64(0)
	for _, validator := range validators {
		beforeTotal += validator.VotingPower
	}

	operator := secp256k1.GenPrivKey().PubKey().Address().String()
	joinPubKey := secp256k1.GenPrivKey().PubKey()
	joinMsg, err := types.NewMsgValidatorJoin(operator, 99, 1, oneGilt, joinPubKey, 1)
	require.NoError(err)

	_, err = msgServer.ValidatorJoin(ctx, joinMsg)
	require.Error(err)
	require.Contains(err.Error(), "native validator GILT stake writes are retired")

	_, err = keeper.GetValidatorFromValID(ctx, 99)
	require.Error(err)

	afterTotal := int64(0)
	for _, validator := range validators {
		updated, getErr := keeper.GetValidatorFromValID(ctx, validator.ValId)
		require.NoError(getErr)
		afterTotal += updated.VotingPower
	}
	require.Equal(beforeTotal, afterTotal)
}

func (s *KeeperTestSuite) TestWave6KeeperJoinValidatorCannotWritePower() {
	ctx, keeper, require := s.ctx, s.stakeKeeper, s.Require()
	validators := s.seedNativeValidators(4)
	beforeTotal := int64(0)
	for _, validator := range validators {
		beforeTotal += validator.VotingPower
	}

	operator := secp256k1.GenPrivKey().PubKey().Address().String()
	joinPubKey := secp256k1.GenPrivKey().PubKey()
	joinMsg, err := types.NewMsgValidatorJoin(operator, 99, 1, oneGilt, joinPubKey, 1)
	require.NoError(err)

	_, err = keeper.JoinValidator(ctx, joinMsg)
	require.Error(err)
	require.Contains(err.Error(), "native validator GILT stake writes are retired")

	_, err = keeper.GetValidatorFromValID(ctx, 99)
	require.Error(err)

	afterTotal := int64(0)
	for _, validator := range validators {
		updated, getErr := keeper.GetValidatorFromValID(ctx, validator.ValId)
		require.NoError(getErr)
		afterTotal += updated.VotingPower
	}
	require.Equal(beforeTotal, afterTotal)
}

func (s *KeeperTestSuite) TestWave6RootAnchoredJoinStillWritesPower() {
	ctx, msgServer, keeper, require := s.ctx, s.msgServer, s.stakeKeeper, s.Require()

	viper.Set(helper.BridgeFlag, true)
	helper.SetRootAnchoredStakeReadEnabled(true)
	s.checkpointKeeper.EXPECT().GetAckCount(gomock.Any()).AnyTimes().Return(uint64(0), nil)
	s.seedNativeValidators(4)

	operator := secp256k1.GenPrivKey().PubKey().Address().String()
	joinPubKey := secp256k1.GenPrivKey().PubKey()
	joinMsg, err := types.NewMsgValidatorJoin(operator, 77, 1, oneGilt, joinPubKey, 1)
	require.NoError(err)

	_, err = msgServer.ValidatorJoin(ctx, joinMsg)
	require.NoError(err)

	validator, err := keeper.GetValidatorFromValID(ctx, 77)
	require.NoError(err)
	require.True(validator.VotingPower > 0)
}

func (s *KeeperTestSuite) TestWave6NativeStakeUpdateRejected() {
	ctx, msgServer, require := s.ctx, s.msgServer, s.Require()
	helper.SetRootAnchoredStakeReadEnabled(false)
	viper.Set(helper.BridgeFlag, true)

	validators := s.seedNativeValidators(4)
	msg, err := types.NewMsgStakeUpdate(validators[0].OperatorAddress(), validators[0].ValId, oneGilt.MulRaw(2), 2)
	require.NoError(err)

	_, err = msgServer.StakeUpdate(ctx, msg)
	require.Error(err)
	require.Contains(err.Error(), "root-anchored stake")
}
