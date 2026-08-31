package types

// Checkpoint tags
var (
	EventTypeCheckpoint      = "checkpoint"
	EventTypeCheckpointAck   = "checkpoint-ack"
	EventTypeCheckpointNoAck = "checkpoint-noack"
	EventTypeSlashRelay      = "slash-relay"

	AttributeKeyProposer    = "proposer"
	AttributeKeyStartBlock  = "start-block"
	AttributeKeyEndBlock    = "end-block"
	AttributeKeyHeaderIndex = "header-index"
	AttributeKeyNewProposer = "new-proposer"
	AttributeKeyRootHash    = "root-hash"
	AttributeKeyAccountHash    = "account-hash"
	AttributeKeyValidatorID    = "validator-id"
	AttributeKeySlashType      = "slash-type"
	AttributeKeyEvidenceRef    = "evidence-ref"
	AttributeKeyFinalizedHeight = "finalized-height"
	AttributeKeyGiltChainId       = "gilt-chain-id"
	AttributeValueCategory        = ModuleName
)
