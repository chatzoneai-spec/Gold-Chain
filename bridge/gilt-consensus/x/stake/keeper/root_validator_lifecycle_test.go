package keeper_test

import (
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	"github.com/golang/mock/gomock"
	"github.com/spf13/viper"

	util "github.com/giltchain/gilt-consensus/common/hex"
	"github.com/giltchain/gilt-consensus/helper"
	"github.com/giltchain/gilt-consensus/x/stake/types"
)

func (s *KeeperTestSuite) TestRootDerivedValidatorJoinWithoutApproval() {
	ctx, msgServer, keeper, require := s.ctx, s.msgServer, s.stakeKeeper, s.Require()

	viper.Set(helper.BridgeFlag, true)
	helper.SetRootAnchoredStakeReadEnabled(true)
	s.checkpointKeeper.EXPECT().GetAckCount(gomock.Any()).AnyTimes().Return(uint64(0), nil)
	s.seedNativeValidators(4)

	operator := secp256k1.GenPrivKey().PubKey().Address().String()
	joinPubKey := secp256k1.GenPrivKey().PubKey()

	joinMsg, err := types.NewMsgValidatorJoin(operator, 42, 1, oneGilt, joinPubKey, 1)
	require.NoError(err)

	_, err = msgServer.ValidatorJoin(ctx, joinMsg)
	require.NoError(err)

	validator, err := keeper.GetValidatorFromValID(ctx, 42)
	require.NoError(err)
	require.Equal(util.FormatAddress(operator), validator.OperatorAddress())
	require.Equal(oneGilt, validator.SelfGiltStake)
	require.Equal(uint64(1), validator.Nonce)
}

func (s *KeeperTestSuite) TestRootDerivedValidatorJoinRejectsReplayedNonce() {
	ctx, msgServer, require := s.ctx, s.msgServer, s.Require()

	viper.Set(helper.BridgeFlag, true)
	helper.SetRootAnchoredStakeReadEnabled(true)
	s.checkpointKeeper.EXPECT().GetAckCount(gomock.Any()).AnyTimes().Return(uint64(0), nil)
	s.seedNativeValidators(4)

	operator := secp256k1.GenPrivKey().PubKey().Address().String()
	joinPubKey := secp256k1.GenPrivKey().PubKey()

	joinMsg, err := types.NewMsgValidatorJoin(operator, 43, 1, oneGilt, joinPubKey, 1)
	require.NoError(err)
	_, err = msgServer.ValidatorJoin(ctx, joinMsg)
	require.NoError(err)

	replayMsg, err := types.NewMsgValidatorJoin(operator, 43, 1, oneGilt, joinPubKey, 1)
	require.NoError(err)
	_, err = msgServer.ValidatorJoin(ctx, replayMsg)
	require.Error(err)
	require.Contains(err.Error(), "invalid validator nonce")
}

func (s *KeeperTestSuite) TestRootDerivedStakeUpdateSetsExactAmount() {
	ctx, msgServer, keeper, require := s.ctx, s.msgServer, s.stakeKeeper, s.Require()

	viper.Set(helper.BridgeFlag, true)
	helper.SetRootAnchoredStakeReadEnabled(true)
	s.checkpointKeeper.EXPECT().GetAckCount(gomock.Any()).AnyTimes().Return(uint64(0), nil)
	s.seedNativeValidators(4)

	operator := secp256k1.GenPrivKey().PubKey().Address().String()
	joinPubKey := secp256k1.GenPrivKey().PubKey()

	joinMsg, err := types.NewMsgValidatorJoin(operator, 44, 1, oneGilt, joinPubKey, 1)
	require.NoError(err)
	_, err = msgServer.ValidatorJoin(ctx, joinMsg)
	require.NoError(err)

	updateMsg, err := types.NewMsgStakeUpdate(operator, 44, oneGilt.MulRaw(2), 2)
	require.NoError(err)
	_, err = msgServer.StakeUpdate(ctx, updateMsg)
	require.NoError(err)

	validator, err := keeper.GetValidatorFromValID(ctx, 44)
	require.NoError(err)
	require.Equal(oneGilt.MulRaw(2), validator.SelfGiltStake)
	require.Equal(uint64(2), validator.Nonce)
}
