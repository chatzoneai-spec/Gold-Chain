package app

import (
	"encoding/json"
	"testing"

	sdkmath "cosmossdk.io/math"
	abci "github.com/cometbft/cometbft/abci/types"
	cmtproto "github.com/cometbft/cometbft/proto/tendermint/types"
	"github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/testutil/mock"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/module"
	"github.com/cosmos/cosmos-sdk/x/auth"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/cosmos/cosmos-sdk/x/bank"
	"github.com/cosmos/cosmos-sdk/x/gov"
	"github.com/golang/mock/gomock"
	"github.com/stretchr/testify/require"

	util "github.com/giltchain/gilt-consensus/common/hex"
	hmTypes "github.com/giltchain/gilt-consensus/types"
	"github.com/giltchain/gilt-consensus/x/chainmanager"
	"github.com/giltchain/gilt-consensus/x/checkpoint"
	"github.com/giltchain/gilt-consensus/x/clerk"
	pricefeedTypes "github.com/giltchain/gilt-consensus/x/pricefeed/types"
	"github.com/giltchain/gilt-consensus/x/stake"
	"github.com/giltchain/gilt-consensus/x/topup"
	topupTypes "github.com/giltchain/gilt-consensus/x/topup/types"
)

func TestGiltConsensusAppExport(t *testing.T) {
	setupAppResult := SetupApp(t, 1)
	app := setupAppResult.App

	_, err := app.ExportAppStateAndValidators(false, []string{}, []string{})
	require.NoError(t, err)
}

func TestRunMigrations(t *testing.T) {
	setupAppResult := SetupApp(t, 1)
	hApp := setupAppResult.App
	configurator := module.NewConfigurator(hApp.appCodec, hApp.MsgServiceRouter(), hApp.GRPCQueryRouter())

	testCases := []struct {
		name         string
		moduleName   string
		fromVersion  uint64
		toVersion    uint64
		expRegErr    bool // errors while registering migration
		expRegErrMsg string
		expRunErr    bool // errors while running migration
		expRunErrMsg string
		expCalled    int
	}{
		{
			"cannot register migration for version 0",
			"bank", 0, 1,
			true, "module migration versions should start at 1: invalid version", false, "", 0,
		},
		{
			"throws error on RunMigrations if no migration registered for bank",
			"", 1, 2,
			false, "", true, "no migrations found for module bank: not found", 0,
		},
		{
			"can register 1->2 migration handler for x/bank, cannot run migration",
			"bank", 1, 2,
			false, "", true, "no migration found for module bank from version 2 to version 3: not found", 0,
		},
		{
			"can register 2->3 migration handler for x/bank, can run migration",
			"bank", 2, bank.AppModule{}.ConsensusVersion(),
			false, "", false, "", int(bank.AppModule{}.ConsensusVersion() - 2), // minus 2 because 1-2 is run in the previous test case.
		},
		{
			"cannot register migration handler for same module & fromVersion",
			"bank", 1, 2,
			true, "another migration for module bank and version 1 already exists: internal logic error", false, "", 0,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(tt *testing.T) {
			var err error

			// Since it's very hard to test actual in-place store migrations in
			// tests (due to the difficulty of maintaining multiple versions of a
			// module), we're just testing here that the migration logic is
			// called.
			called := 0

			if tc.moduleName != "" {
				for i := tc.fromVersion; i < tc.toVersion; i++ {
					// Register migration for module from version `fromVersion` to `fromVersion+1`.
					tt.Logf("Registering migration for %q v%d", tc.moduleName, i)
					err = configurator.RegisterMigration(tc.moduleName, i, func(sdk.Context) error {
						called++

						return nil
					})

					if tc.expRegErr {
						require.EqualError(tt, err, tc.expRegErrMsg)

						return
					}
					require.NoError(tt, err, "registering migration")
				}
			}

			// Run migrations only for bank module. That's why we put the initial
			// version for bank module as 1, and for all other modules, we put as
			// their latest ConsensusVersion.
			_, err = hApp.ModuleManager.RunMigrations(
				hApp.NewContextLegacy(true, cmtproto.Header{Height: hApp.LastBlockHeight()}), configurator,
				module.VersionMap{
					"bank":         1,
					"auth":         auth.AppModule{}.ConsensusVersion(),
					"gov":          gov.AppModule{}.ConsensusVersion(),
					"stake":        stake.AppModule{}.ConsensusVersion(),
					"clerk":        clerk.AppModule{}.ConsensusVersion(),
					"checkpoint":   checkpoint.AppModule{}.ConsensusVersion(),
					"chainmanager": chainmanager.AppModule{}.ConsensusVersion(),
					"topup":        topup.AppModule{}.ConsensusVersion(),
				},
			)

			if tc.expRunErr {
				require.EqualError(tt, err, tc.expRunErrMsg, "running migration")
			} else {
				require.NoError(tt, err, "running migration")
				// Make sure bank's migration is called.
				require.Equal(tt, tc.expCalled, called)
			}
		})
	}
}

func TestInitGenesisOnMigration(t *testing.T) {
	setupAppResult := SetupApp(t, 1)
	app := setupAppResult.App
	ctx := app.NewContextLegacy(true, cmtproto.Header{Height: app.LastBlockHeight()})

	// Create a mock module. This module will serve as the new module we're
	// adding during a migration.
	mockCtrl := gomock.NewController(t)
	t.Cleanup(mockCtrl.Finish)
	mockModule := mock.NewMockAppModuleWithAllExtensions(mockCtrl)
	mockDefaultGenesis := json.RawMessage(`{"key": "value"}`)
	mockModule.EXPECT().DefaultGenesis(gomock.Eq(app.appCodec)).Times(1).Return(mockDefaultGenesis)
	mockModule.EXPECT().InitGenesis(gomock.Eq(ctx), gomock.Eq(app.appCodec), gomock.Eq(mockDefaultGenesis)).Times(1)
	mockModule.EXPECT().ConsensusVersion().Times(1).Return(uint64(0))

	app.ModuleManager.Modules["mock"] = mockModule

	// Run migrations only for "mock" module. We exclude it from
	// the VersionMap to simulate upgrading with a new module.
	_, err := app.ModuleManager.RunMigrations(ctx, app.configurator,
		module.VersionMap{
			"bank":         bank.AppModule{}.ConsensusVersion(),
			"auth":         auth.AppModule{}.ConsensusVersion(),
			"gov":          gov.AppModule{}.ConsensusVersion(),
			"stake":        stake.AppModule{}.ConsensusVersion(),
			"clerk":        clerk.AppModule{}.ConsensusVersion(),
			"checkpoint":   checkpoint.AppModule{}.ConsensusVersion(),
			"chainmanager": chainmanager.AppModule{}.ConsensusVersion(),
			"topup":        topup.AppModule{}.ConsensusVersion(),
		},
	)
	require.NoError(t, err)
}

func TestValidateGenesis(t *testing.T) {
	t.Parallel()

	setupAppResult := SetupApp(t, 1)
	hApp := setupAppResult.App

	// not valid app state
	require.Panics(t, func() {
		_, err := hApp.InitChain(
			&abci.RequestInitChain{
				Validators:    []abci.ValidatorUpdate{},
				AppStateBytes: []byte("{}"),
			},
		)
		require.Error(t, err)
	})
}

func TestGetMaccPerms(t *testing.T) {
	t.Parallel()

	dup := GetMaccPerms()
	require.Equal(t, maccPerms, dup, "duplicated module account permissions differed from actual module account permissions")
}

func TestEndBlockerEmitsTransferEvent(t *testing.T) {
	setupAppResult := SetupApp(t, 1)
	app := setupAppResult.App
	ctx := app.NewContextLegacy(true, cmtproto.Header{Height: app.LastBlockHeight()})

	testAddr := "0x1234567890abcdef1234567890abcdef12345678"
	ac := address.NewHexCodec()
	proposer, err := ac.StringToBytes(testAddr)
	require.NoError(t, err)

	// Create a test proposer account
	proposerAcc := app.AccountKeeper.NewAccountWithAddress(ctx, proposer)
	app.AccountKeeper.SetAccount(ctx, proposerAcc)

	// Set the block proposer
	err = app.AccountKeeper.SetBlockProposer(ctx, proposerAcc.GetAddress())
	require.NoError(t, err)

	validators := app.StakeKeeper.GetCurrentValidators(ctx)
	require.NotEmpty(t, validators)
	rewardRecipient := util.FormatAddress(validators[0].Signer)
	rewardRecipientBytes, err := ac.StringToBytes(rewardRecipient)
	require.NoError(t, err)
	rewardRecipientAcc := app.AccountKeeper.NewAccountWithAddress(ctx, sdk.AccAddress(rewardRecipientBytes))
	app.AccountKeeper.SetAccount(ctx, rewardRecipientAcc)

	err = app.PriceFeedKeeper.SetPriceSnapshot(ctx, pricefeedTypes.PriceSnapshot{
		Epoch:           1,
		GiltPriceInGold: sdkmath.NewInt(pricefeedTypes.PriceScale),
		SourceAdapter:   pricefeedTypes.AdapterManual,
		BlockHeight:     uint64(ctx.BlockHeight()),
		ValidUntilEpoch: 10,
	})
	require.NoError(t, err)

	// Fund the fee collector
	feeAmount := sdkmath.NewInt(1000)
	feeCoins := sdk.NewCoins(sdk.NewCoin(authtypes.FeeToken, feeAmount))

	// Use the topup module which has minting permissions
	err = app.BankKeeper.MintCoins(ctx, topupTypes.ModuleName, feeCoins)
	require.NoError(t, err)

	// Transfer from topup to fee collector
	err = app.BankKeeper.SendCoinsFromModuleToModule(ctx, topupTypes.ModuleName, authtypes.FeeCollectorName, feeCoins)
	require.NoError(t, err)

	// Run EndBlocker
	result, err := app.EndBlocker(ctx)
	require.NoError(t, err)

	// Verify fee transfer events were emitted and account for the full fee amount.
	totalDistributed := sdkmath.ZeroInt()
	foundRewardRecipient := false
	for _, event := range result.Events {
		if event.Type != hmTypes.EventTypeFeeTransfer {
			continue
		}

		require.NotNil(t, event.Attributes, "fee transfer event should have attributes")
		require.Equal(t, 3, len(event.Attributes))

		var proposerAttr, denomAttr, amountAttr *abci.EventAttribute
		for _, attr := range event.Attributes {
			switch attr.Key {
			case hmTypes.AttributeKeyProposer:
				proposerAttr = &attr
			case hmTypes.AttributeKeyDenom:
				denomAttr = &attr
			case hmTypes.AttributeKeyAmount:
				amountAttr = &attr
			}
		}

		require.NotNil(t, proposerAttr)
		require.NotNil(t, denomAttr)
		require.NotNil(t, denomAttr.Value, "denom attribute value should not be nil")
		require.Equal(t, authtypes.FeeToken, denomAttr.Value)

		require.NotNil(t, amountAttr)
		require.NotNil(t, amountAttr.Value, "amount attribute value should not be nil")
		amount, ok := sdkmath.NewIntFromString(amountAttr.Value)
		require.True(t, ok, "amount attribute should be a valid integer")
		require.True(t, amount.IsPositive(), "amount attribute should be positive")
		totalDistributed = totalDistributed.Add(amount)

		if proposerAttr.Value == rewardRecipient {
			foundRewardRecipient = true
		}
	}
	require.True(t, foundRewardRecipient, "fee transfer event should include the first active validator")
	require.Equal(t, feeAmount, totalDistributed)
}
