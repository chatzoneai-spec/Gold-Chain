package keeper_test

import (
	"cosmossdk.io/math"
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	"github.com/golang/mock/gomock"

	"github.com/giltchain/gilt-consensus/x/stake/types"
)

var oneGilt = math.NewInt(1000000000000000000)

const TxHash1 = "0x000000000000000000000000000000000000000000000000000000000000dead"

func (s *KeeperTestSuite) TestWithdrawValidatorStakeAfterUnbonding() {
	ctx, msgServer, keeper, require := s.ctx, s.msgServer, s.stakeKeeper, s.Require()
	validators := s.seedNativeValidators(4)
	validators[0].VotingPower = 0
	validators[0].EndEpoch = 2
	require.NoError(keeper.AddValidator(ctx, validators[0]))
	s.checkpointKeeper.EXPECT().GetAckCount(gomock.Any()).AnyTimes().Return(uint64(3), nil)

	msg := types.NewMsgWithdrawValidatorStake(validators[0].OperatorAddress(), validators[0].ValId)
	s.bankKeeper.EXPECT().
		SendCoinsFromModuleToAccount(gomock.Any(), types.ModuleName, gomock.Any(), gomock.Any()).
		Return(nil).
		Times(1)

	_, err := msgServer.WithdrawValidatorStake(ctx, msg)
	require.NoError(err)

	updated, err := keeper.GetValidatorFromValID(ctx, validators[0].ValId)
	require.NoError(err)
	require.True(updated.SelfGiltStake.IsZero())
}

func (s *KeeperTestSuite) seedNativeValidators(count int) []types.Validator {
	ctx, keeper, require := s.ctx, s.stakeKeeper, s.Require()
	validators := make([]types.Validator, 0, count)
	setValidators := make([]*types.Validator, 0, count)

	for i := 0; i < count; i++ {
		pubKey := secp256k1.GenPrivKey().PubKey()
		validator, err := types.NewValidator(uint64(i+1), 1, 0, 1, 1, pubKey, pubKey.Address().String())
		require.NoError(err)
		validator.SelfGiltStake = oneGilt
		validator.NormalizeLifecycleAccounting()

		require.NoError(keeper.AddValidator(ctx, *validator))
		validators = append(validators, *validator)
		setValidators = append(setValidators, validator)
	}

	validatorSet := types.NewValidatorSet(setValidators)
	require.NoError(keeper.UpdateValidatorSetInStore(ctx, *validatorSet))
	require.NoError(keeper.UpdatePreviousBlockValidatorSetInStore(ctx, *validatorSet))
	require.NoError(keeper.UpdatePenultimateBlockValidatorSetInStore(ctx, *validatorSet))
	return validators
}

func (s *KeeperTestSuite) overwriteNativeValidatorSet(validators []*types.Validator) {
	ctx, keeper, require := s.ctx, s.stakeKeeper, s.Require()
	validatorSet := types.NewValidatorSet(validators)
	require.NoError(keeper.UpdateValidatorSetInStore(ctx, *validatorSet))
	require.NoError(keeper.UpdatePreviousBlockValidatorSetInStore(ctx, *validatorSet))
	require.NoError(keeper.UpdatePenultimateBlockValidatorSetInStore(ctx, *validatorSet))
}
