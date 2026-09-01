package types

import (
	"bytes"

	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	ethcrypto "github.com/ethereum/go-ethereum/crypto"

	util "github.com/giltchain/gilt-consensus/common/hex"
)

func validateSignerPubKeyBytes(field string, pubKey []byte) error {
	_, err := SignerAddressFromPubKey(pubKey)
	return err
}

// SignerAddressFromPubKey derives the Ethereum signer address from a root-chain pubkey.
func SignerAddressFromPubKey(pubKey []byte) (string, error) {
	return signerAddressFromPubKeyBytes("validator signer public key", pubKey)
}

func signerAddressFromPubKeyBytes(field string, pubKey []byte) (string, error) {
	if pubKey == nil {
		return "", ErrInvalidMsg.Wrapf("%s can't be nil", field)
	}
	if bytes.Equal(pubKey, EmptyPubKey[:]) {
		return "", ErrInvalidMsg.Wrapf("%s can't be of zero bytes", field)
	}
	if len(pubKey) != secp256k1.PubKeySize {
		return "", ErrInvalidMsg.Wrapf("%s has invalid length %d, expected %d", field, len(pubKey), secp256k1.PubKeySize)
	}
	if pubKey[0] != 0x04 {
		return "", ErrInvalidMsg.Wrapf("%s must be an uncompressed secp256k1 public key", field)
	}
	parsed, err := ethcrypto.UnmarshalPubkey(pubKey)
	if err != nil || parsed == nil || parsed.X == nil || parsed.Y == nil {
		return "", ErrInvalidMsg.Wrapf("%s is not a valid secp256k1 public key", field)
	}
	return util.FormatAddress(ethcrypto.PubkeyToAddress(*parsed).String()), nil
}

func validateMatchingSigner(pubKey []byte, signer string) error {
	derivedSigner, err := signerAddressFromPubKeyBytes("validator signer public key", pubKey)
	if err != nil {
		return err
	}
	if signer == "" {
		return ErrInvalidMsg
	}
	if util.FormatAddress(signer) != derivedSigner {
		return ErrInvalidMsg
	}
	return nil
}
